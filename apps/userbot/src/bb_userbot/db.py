"""asyncpg-обёртки: чтение UserbotSession/UserbotChannel, запись IngestEvent, AppLog."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

import asyncpg


@dataclass(frozen=True, slots=True)
class UserbotSessionRow:
    user_id: str
    session_string: str | None
    phone: str | None
    status: str


@dataclass(frozen=True, slots=True)
class UserbotChannelRow:
    id: str
    user_id: str
    chat_id: str
    title: str
    enabled: bool


@dataclass(frozen=True, slots=True)
class CommandRow:
    id: str
    user_id: str
    type: str
    payload_json: str | None


async def connect_pool(database_url: str, min_size: int = 1, max_size: int = 5) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(database_url, min_size=min_size, max_size=max_size)
    if pool is None:
        raise RuntimeError("Failed to create asyncpg pool")
    return pool


async def list_active_sessions(pool: asyncpg.Pool) -> list[UserbotSessionRow]:
    rows = await pool.fetch(
        """
        SELECT us."userId", us."sessionString", us."phone", us."status"
        FROM "UserbotSession" us
        JOIN "User" u ON u.id = us."userId"
        WHERE u.enabled = true AND us."sessionString" IS NOT NULL
        """
    )
    return [
        UserbotSessionRow(
            user_id=r["userId"],
            session_string=r["sessionString"],
            phone=r["phone"],
            status=r["status"],
        )
        for r in rows
    ]


async def list_enabled_channels(pool: asyncpg.Pool, user_id: str) -> list[UserbotChannelRow]:
    rows = await pool.fetch(
        """
        SELECT id, "userId", "chatId", title, enabled
        FROM "UserbotChannel"
        WHERE "userId" = $1 AND enabled = true
        """,
        user_id,
    )
    return [
        UserbotChannelRow(
            id=r["id"],
            user_id=r["userId"],
            chat_id=r["chatId"],
            title=r["title"],
            enabled=r["enabled"],
        )
        for r in rows
    ]


async def update_session_status(
    pool: asyncpg.Pool,
    user_id: str,
    status: str,
    last_error: str | None = None,
    phone: str | None = None,
) -> None:
    await pool.execute(
        """
        UPDATE "UserbotSession"
        SET status = $2,
            "lastError" = $3,
            "lastSeenAt" = CASE WHEN $2 = 'connected' THEN now() ELSE "lastSeenAt" END,
            phone = COALESCE($4, phone),
            "updatedAt" = now()
        WHERE "userId" = $1
        """,
        user_id,
        status,
        last_error,
        phone,
    )


async def save_session_string(
    pool: asyncpg.Pool, user_id: str, encrypted_session: str, phone: str | None
) -> None:
    await pool.execute(
        """
        INSERT INTO "UserbotSession" ("userId", "sessionString", phone, status, "updatedAt")
        VALUES ($1, $2, $3, 'connected', now())
        ON CONFLICT ("userId") DO UPDATE SET
            "sessionString" = EXCLUDED."sessionString",
            phone = COALESCE(EXCLUDED.phone, "UserbotSession".phone),
            status = 'connected',
            "lastError" = NULL,
            "lastSeenAt" = now(),
            "updatedAt" = now()
        """,
        user_id,
        encrypted_session,
        phone,
    )


async def clear_session(pool: asyncpg.Pool, user_id: str) -> None:
    await pool.execute(
        """
        UPDATE "UserbotSession"
        SET "sessionString" = NULL, status = 'disconnected', "updatedAt" = now()
        WHERE "userId" = $1
        """,
        user_id,
    )


def make_dedup_key(user_id: str, chat_id: str, message_id: str) -> str:
    digest = hashlib.sha256(f"{user_id}:{chat_id}:{message_id}".encode()).hexdigest()[:32]
    return digest


async def insert_ingest_event(
    pool: asyncpg.Pool,
    *,
    user_id: str,
    chat_id: str,
    message_id: str,
    text: str | None,
    reply_to_chat_id: str | None,
    reply_to_message_id: str | None,
    reply_to_text: str | None,
    raw: dict[str, Any] | None,
) -> str | None:
    """Возвращает `IngestEvent.id` или None, если уже существует (дедуп)."""
    dedup_key = make_dedup_key(user_id, chat_id, message_id)
    row = await pool.fetchrow(
        """
        INSERT INTO "IngestEvent" (
            id, "userId", "chatId", "messageId", "dedupMessageKey",
            text, "replyToChatId", "replyToMessageId", "replyToText", "rawJson",
            status, "createdAt"
        )
        VALUES (
            gen_random_uuid()::text, $1, $2, $3, $4,
            $5, $6, $7, $8, $9,
            'pending_classify', now()
        )
        ON CONFLICT ("dedupMessageKey") DO NOTHING
        RETURNING id
        """,
        user_id,
        chat_id,
        message_id,
        dedup_key,
        text,
        reply_to_chat_id,
        reply_to_message_id,
        reply_to_text,
        json.dumps(raw) if raw is not None else None,
    )
    return row["id"] if row else None


async def claim_pending_command(pool: asyncpg.Pool, user_id: str) -> CommandRow | None:
    row = await pool.fetchrow(
        """
        UPDATE "UserbotCommand"
        SET status = 'running', "startedAt" = now(), "updatedAt" = now()
        WHERE id = (
            SELECT id FROM "UserbotCommand"
            WHERE "userId" = $1 AND status = 'queued'
            ORDER BY "createdAt" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING id, "userId", type, "payloadJson"
        """,
        user_id,
    )
    if not row:
        return None
    return CommandRow(
        id=row["id"],
        user_id=row["userId"],
        type=row["type"],
        payload_json=row["payloadJson"],
    )


async def finish_command(
    pool: asyncpg.Pool,
    command_id: str,
    *,
    ok: bool,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    await pool.execute(
        """
        UPDATE "UserbotCommand"
        SET status = $2,
            "resultJson" = $3,
            error = $4,
            "finishedAt" = now(),
            "updatedAt" = now()
        WHERE id = $1
        """,
        command_id,
        "done" if ok else "failed",
        json.dumps(result) if result is not None else None,
        error,
    )


async def write_app_log(
    pool: asyncpg.Pool,
    *,
    level: str,
    category: str,
    message: str,
    user_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    await pool.execute(
        """
        INSERT INTO "AppLog" (id, "userId", level, category, service, message, payload, "createdAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, 'userbot', $4, $5, now())
        """,
        user_id,
        level,
        category,
        message,
        json.dumps(payload) if payload is not None else None,
    )
