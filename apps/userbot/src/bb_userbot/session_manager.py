"""Мультиплекс Telethon-клиентов: по одному на активную UserbotSession.

Ответственности:
  - При старте поднимает клиентов для всех `UserbotSession.status in (connected,)` у enabled-пользователей.
  - Обработчик новых сообщений пишет `IngestEvent`.
  - `login_qr` создаёт клиента, просит QRLoginToken, сохраняет session_string after success.
  - `logout` останавливает клиента и зануляет `sessionString`.
  - `add_channel` / `remove_channel` — ничего не делает с Telegram напрямую: каналы
    записаны в `UserbotChannel`, фильтрация на приёме — по `enabled=true`.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import asyncpg
import structlog
from telethon import TelegramClient, events
from telethon.errors import PasswordHashInvalidError, SessionPasswordNeededError
from telethon.sessions import StringSession

from . import db
from .crypto import decrypt_secret, encrypt_secret, is_encrypted_payload

log = structlog.get_logger(__name__)


@dataclass
class _ClientWrapper:
    user_id: str
    client: TelegramClient
    task: asyncio.Task[None] | None = None


class SessionManager:
    def __init__(
        self,
        pool: asyncpg.Pool,
        *,
        api_id: int,
        api_hash: str,
        encryption_key: str,
    ) -> None:
        self._pool = pool
        self._api_id = api_id
        self._api_hash = api_hash
        self._encryption_key = encryption_key
        self._clients: dict[str, _ClientWrapper] = {}
        self._pending_2fa: dict[str, TelegramClient] = {}
        self._lock = asyncio.Lock()

    async def start_existing_sessions(self) -> None:
        sessions = await db.list_active_sessions(self._pool)
        for row in sessions:
            if not row.session_string:
                continue
            try:
                await self._start_client(row.user_id, row.session_string, persist=False)
            except Exception as exc:  # noqa: BLE001
                log.error("userbot.start_session_failed", user_id=row.user_id, error=str(exc))
                await db.update_session_status(
                    self._pool, row.user_id, "failed", last_error=str(exc)
                )

    async def stop_all(self) -> None:
        async with self._lock:
            for wrapper in list(self._clients.values()):
                await self._disconnect_client(wrapper)
            self._clients.clear()
            for client in list(self._pending_2fa.values()):
                try:
                    await client.disconnect()
                except Exception:  # noqa: BLE001
                    pass
            self._pending_2fa.clear()

    async def _start_client(
        self, user_id: str, session_value: str, *, persist: bool
    ) -> TelegramClient:
        async with self._lock:
            if user_id in self._clients:
                raise RuntimeError(f"userbot already running for user {user_id}")

            plaintext = (
                decrypt_secret(self._encryption_key, session_value)
                if is_encrypted_payload(session_value)
                else session_value
            )
            client = TelegramClient(
                StringSession(plaintext), self._api_id, self._api_hash,
                device_model="bb-userbot", system_version="1.0", app_version="0.0.0",
            )
            await client.connect()
            if not await client.is_user_authorized():
                await client.disconnect()
                raise RuntimeError("session string is not authorized")

            wrapper = _ClientWrapper(user_id=user_id, client=client)
            self._install_handlers(wrapper)
            self._clients[user_id] = wrapper

            if persist:
                encrypted = encrypt_secret(self._encryption_key, client.session.save())
                me: Any = await client.get_me()
                phone = getattr(me, "phone", None)
                await db.save_session_string(
                    self._pool, user_id, encrypted, str(phone) if phone else None
                )
            else:
                await db.update_session_status(self._pool, user_id, "connected")

            log.info("userbot.session_connected", user_id=user_id)
            return client

    async def _disconnect_client(self, wrapper: _ClientWrapper) -> None:
        try:
            await wrapper.client.disconnect()
        except Exception as exc:  # noqa: BLE001
            log.warning("userbot.disconnect_error", user_id=wrapper.user_id, error=str(exc))

    def _install_handlers(self, wrapper: _ClientWrapper) -> None:
        client = wrapper.client
        user_id = wrapper.user_id

        @client.on(events.NewMessage(incoming=True))
        async def _on_new_message(event: events.NewMessage.Event) -> None:
            await self._handle_incoming(user_id, event)

    async def _handle_incoming(
        self, user_id: str, event: events.NewMessage.Event
    ) -> None:
        chat = await event.get_chat()
        chat_id = str(getattr(chat, "id", event.chat_id))

        enabled = await db.list_enabled_channels(self._pool, user_id)
        enabled_ids = {c.chat_id for c in enabled}
        if chat_id not in enabled_ids and f"-100{chat_id}" not in enabled_ids:
            return

        message = event.message
        text: str | None = getattr(message, "message", None) or None
        message_id = str(message.id)

        reply_chat_id: str | None = None
        reply_msg_id: str | None = None
        reply_text: str | None = None
        if message.is_reply:
            try:
                replied = await message.get_reply_message()
                if replied:
                    reply_msg_id = str(replied.id)
                    reply_chat_id = chat_id
                    reply_text = getattr(replied, "message", None) or None
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "userbot.reply_fetch_failed",
                    user_id=user_id,
                    chat_id=chat_id,
                    error=str(exc),
                )

        ingest_id = await db.insert_ingest_event(
            self._pool,
            user_id=user_id,
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            reply_to_chat_id=reply_chat_id,
            reply_to_message_id=reply_msg_id,
            reply_to_text=reply_text,
            raw=None,
        )
        if ingest_id is None:
            return
        log.info(
            "userbot.ingest",
            user_id=user_id,
            chat_id=chat_id,
            message_id=message_id,
            ingest_id=ingest_id,
        )
        # Classifier поллит IngestEvent со status=pending_classify сам
        # (см. apps/classifier). Нам не нужно ничего публиковать в pg-boss.

    # --- Commands from UserbotCommand queue ---

    async def start_qr_login(self, user_id: str) -> dict[str, Any]:
        """
        Запускает QR-логин для пользователя. Возвращает {'qr_url': '...'} сразу,
        а в фоне ждёт сканирования QR и сохраняет session string по успеху.
        """
        async with self._lock:
            if user_id in self._clients:
                await self._disconnect_client(self._clients.pop(user_id))
            pending = self._pending_2fa.pop(user_id, None)
            if pending is not None:
                await pending.disconnect()

        client = TelegramClient(
            StringSession(), self._api_id, self._api_hash,
            device_model="bb-userbot", system_version="1.0", app_version="0.0.0",
        )
        await client.connect()
        qr = await client.qr_login()

        async def _wait_for_scan() -> None:
            try:
                await qr.wait()
                session_str = client.session.save()
                me: Any = await client.get_me()
                phone = getattr(me, "phone", None)
                await db.save_session_string(
                    self._pool,
                    user_id,
                    encrypt_secret(self._encryption_key, session_str),
                    str(phone) if phone else None,
                )
                async with self._lock:
                    wrapper = _ClientWrapper(user_id=user_id, client=client)
                    self._install_handlers(wrapper)
                    self._clients[user_id] = wrapper
                log.info("userbot.qr_login_success", user_id=user_id)
            except SessionPasswordNeededError:
                async with self._lock:
                    self._pending_2fa[user_id] = client
                await db.update_session_status(
                    self._pool, user_id, "awaiting_2fa", last_error=None
                )
                log.info("userbot.qr_2fa_required", user_id=user_id)
            except Exception as exc:  # noqa: BLE001
                log.error("userbot.qr_login_failed", user_id=user_id, error=str(exc))
                await db.update_session_status(
                    self._pool, user_id, "failed", last_error=str(exc)
                )
                async with self._lock:
                    self._pending_2fa.pop(user_id, None)
                await client.disconnect()

        await db.update_session_status(self._pool, user_id, "qr_pending")
        asyncio.create_task(_wait_for_scan())
        return {"qr_url": qr.url, "expires_in": 60}

    async def submit_2fa_password(self, user_id: str, password: str) -> None:
        async with self._lock:
            client = self._pending_2fa.get(user_id)
        if client is None:
            raise RuntimeError("2FA password is not requested for this user")
        try:
            await client.sign_in(password=password)
            session_str = client.session.save()
            me: Any = await client.get_me()
            phone = getattr(me, "phone", None)
            await db.save_session_string(
                self._pool,
                user_id,
                encrypt_secret(self._encryption_key, session_str),
                str(phone) if phone else None,
            )
            async with self._lock:
                self._pending_2fa.pop(user_id, None)
                wrapper = _ClientWrapper(user_id=user_id, client=client)
                self._install_handlers(wrapper)
                self._clients[user_id] = wrapper
            log.info("userbot.2fa_login_success", user_id=user_id)
        except PasswordHashInvalidError as exc:
            await db.update_session_status(
                self._pool, user_id, "awaiting_2fa", last_error="Invalid 2FA password"
            )
            raise RuntimeError("Invalid 2FA password") from exc
        except Exception as exc:  # noqa: BLE001
            await db.update_session_status(
                self._pool, user_id, "failed", last_error=str(exc)
            )
            async with self._lock:
                self._pending_2fa.pop(user_id, None)
            await client.disconnect()
            raise

    async def logout(self, user_id: str) -> None:
        async with self._lock:
            wrapper = self._clients.pop(user_id, None)
            pending = self._pending_2fa.pop(user_id, None)
        if wrapper is not None:
            try:
                await wrapper.client.log_out()
            except Exception as exc:  # noqa: BLE001
                log.warning("userbot.logout_error", user_id=user_id, error=str(exc))
            await self._disconnect_client(wrapper)
        if pending is not None:
            await pending.disconnect()
        await db.clear_session(self._pool, user_id)
        log.info("userbot.logout", user_id=user_id)

    async def reconnect(self, user_id: str) -> None:
        async with self._lock:
            wrapper = self._clients.pop(user_id, None)
            pending = self._pending_2fa.pop(user_id, None)
        if wrapper is not None:
            await self._disconnect_client(wrapper)
        if pending is not None:
            await pending.disconnect()
        rows = await self._pool.fetch(
            'SELECT "sessionString" FROM "UserbotSession" WHERE "userId" = $1',
            user_id,
        )
        if not rows or not rows[0]["sessionString"]:
            raise RuntimeError("no session string to reconnect")
        await self._start_client(user_id, rows[0]["sessionString"], persist=False)
