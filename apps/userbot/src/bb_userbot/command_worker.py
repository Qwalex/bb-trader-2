"""Поллер таблицы UserbotCommand: забирает queued-команды и зовёт SessionManager."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import asyncpg
import structlog

from . import db
from .session_manager import SessionManager

log = structlog.get_logger(__name__)


class CommandWorker:
    def __init__(
        self,
        pool: asyncpg.Pool,
        sessions: SessionManager,
        *,
        poll_interval_sec: int = 2,
    ) -> None:
        self._pool = pool
        self._sessions = sessions
        self._poll_interval_sec = poll_interval_sec
        self._stopped = asyncio.Event()

    async def run(self) -> None:
        log.info("userbot.command_worker.start", poll_sec=self._poll_interval_sec)
        while not self._stopped.is_set():
            try:
                await self._poll_once()
            except Exception as exc:  # noqa: BLE001
                log.error("userbot.command_worker.error", error=str(exc))
            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=self._poll_interval_sec)
            except TimeoutError:
                pass

    async def stop(self) -> None:
        self._stopped.set()

    async def _poll_once(self) -> None:
        """
        Идём по всем пользователям, у которых есть queued команды, и обрабатываем их
        по одной (SELECT ... SKIP LOCKED).
        """
        users = await self._pool.fetch(
            """
            SELECT DISTINCT "userId"
            FROM "UserbotCommand"
            WHERE status = 'queued'
            """
        )
        for row in users:
            user_id = row["userId"]
            cmd = await db.claim_pending_command(self._pool, user_id)
            if cmd is None:
                continue
            await self._dispatch(cmd.id, cmd.user_id, cmd.type, cmd.payload_json)

    async def _dispatch(
        self, command_id: str, user_id: str, cmd_type: str, payload_json: str | None
    ) -> None:
        payload: dict[str, Any] = {}
        if payload_json:
            try:
                payload = json.loads(payload_json)
            except json.JSONDecodeError:
                payload = {}

        log.info("userbot.command.run", command_id=command_id, user_id=user_id, type=cmd_type)

        try:
            if cmd_type == "login_qr":
                result = await self._sessions.start_qr_login(user_id)
                await db.finish_command(self._pool, command_id, ok=True, result=result)
            elif cmd_type == "logout":
                await self._sessions.logout(user_id)
                await db.finish_command(self._pool, command_id, ok=True, result={})
            elif cmd_type == "reconnect":
                await self._sessions.reconnect(user_id)
                await db.finish_command(self._pool, command_id, ok=True, result={})
            elif cmd_type in ("add_channel", "remove_channel", "sync_dialogs"):
                # Эти команды не требуют действий с Telegram клиентом:
                # UserbotChannel управляется api, userbot читает его при каждом входящем.
                # `sync_dialogs` в будущем может вернуть список диалогов.
                await db.finish_command(self._pool, command_id, ok=True, result={"noop": True})
            else:
                await db.finish_command(
                    self._pool,
                    command_id,
                    ok=False,
                    error=f"unknown command type: {cmd_type}",
                )
        except Exception as exc:  # noqa: BLE001
            log.error(
                "userbot.command.failed",
                command_id=command_id,
                user_id=user_id,
                type=cmd_type,
                error=str(exc),
            )
            await db.finish_command(self._pool, command_id, ok=False, error=str(exc))
            await db.write_app_log(
                self._pool,
                level="error",
                category="userbot",
                message=f"command {cmd_type} failed: {exc}",
                user_id=user_id,
                payload={"command_id": command_id, "payload": payload},
            )
