"""Конфигурация через env vars. Fail-fast при старте, если нет обязательных."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Config:
    database_url: str
    encryption_key: str
    telegram_api_id: int
    telegram_api_hash: str
    log_level: str = "info"
    pg_boss_schema: str = "pgboss"
    reconnect_interval_sec: int = 10
    command_poll_interval_sec: int = 2

    @classmethod
    def from_env(cls) -> Config:
        database_url = _required("DATABASE_URL")
        encryption_key = _required("APP_ENCRYPTION_KEY")
        api_id_raw = _required("TELEGRAM_USERBOT_API_ID")
        try:
            api_id = int(api_id_raw)
        except ValueError as exc:
            raise RuntimeError(
                f"TELEGRAM_USERBOT_API_ID must be int, got {api_id_raw!r}"
            ) from exc
        api_hash = _required("TELEGRAM_USERBOT_API_HASH")
        return cls(
            database_url=database_url,
            encryption_key=encryption_key,
            telegram_api_id=api_id,
            telegram_api_hash=api_hash,
            log_level=os.environ.get("LOG_LEVEL", "info").lower(),
            pg_boss_schema=os.environ.get("PG_BOSS_SCHEMA", "pgboss"),
        )


def _required(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(f"Missing required env var: {key}")
    return value
