"""Entrypoint: поднимает asyncpg pool, SessionManager, CommandWorker; ждёт SIGTERM."""

from __future__ import annotations

import asyncio
import os
import signal
from typing import Any

import asyncpg.exceptions
import structlog
from dotenv import load_dotenv

from . import db
from .command_worker import CommandWorker
from .config import Config
from .logging_setup import configure_logging
from .session_manager import SessionManager


async def _start_sessions_when_schema_ready(
    sessions: SessionManager,
    log: Any,
) -> None:
    """Wait until Prisma tables exist (e.g. after api pre-deploy runs migrate)."""
    max_attempts = max(1, int(os.environ.get("USERBOT_SCHEMA_WAIT_ATTEMPTS", "40")))
    delay_sec = max(0.5, float(os.environ.get("USERBOT_SCHEMA_WAIT_SEC", "3")))
    for attempt in range(1, max_attempts + 1):
        try:
            await sessions.start_existing_sessions()
            if attempt > 1:
                log.info("userbot.schema_ready", attempts=attempt)
            return
        except asyncpg.exceptions.UndefinedTableError:
            if attempt == 1:
                log.warning(
                    "userbot.schema_missing",
                    hint=(
                        "No Prisma tables yet (e.g. UserbotSession). "
                        "Deploy `api` once so pre-deploy runs `prisma migrate deploy`, "
                        "or run migrate manually against DATABASE_URL."
                    ),
                )
            if attempt >= max_attempts:
                log.error(
                    "userbot.schema_missing_give_up",
                    attempts=max_attempts,
                    delay_sec=delay_sec,
                )
                raise
            log.info(
                "userbot.schema_wait_retry",
                attempt=attempt,
                max_attempts=max_attempts,
                sleep_sec=delay_sec,
            )
            await asyncio.sleep(delay_sec)


async def amain() -> None:
    load_dotenv()
    cfg = Config.from_env()
    configure_logging(cfg.log_level)
    log = structlog.get_logger("bb_userbot")
    log.info("userbot.start", log_level=cfg.log_level)

    pool = await db.connect_pool(cfg.database_url, min_size=1, max_size=5)

    sessions = SessionManager(
        pool,
        api_id=cfg.telegram_api_id,
        api_hash=cfg.telegram_api_hash,
        encryption_key=cfg.encryption_key,
    )
    await _start_sessions_when_schema_ready(sessions, log)

    worker = CommandWorker(pool, sessions, poll_interval_sec=cfg.command_poll_interval_sec)

    stop_event = asyncio.Event()

    def _stop_handler() -> None:
        log.info("userbot.stop_signal")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, sig_name, None)
        if sig is None:
            continue
        try:
            loop.add_signal_handler(sig, _stop_handler)
        except NotImplementedError:
            # Windows does not fully support add_signal_handler for SIGTERM.
            pass

    worker_task = asyncio.create_task(worker.run())

    await stop_event.wait()

    log.info("userbot.shutdown.begin")
    await worker.stop()
    worker_task.cancel()
    try:
        await worker_task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001
        pass
    await sessions.stop_all()
    await pool.close()
    log.info("userbot.shutdown.done")


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
