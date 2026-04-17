"""Entrypoint: поднимает asyncpg pool, SessionManager, CommandWorker; ждёт SIGTERM."""

from __future__ import annotations

import asyncio
import signal

import structlog
from dotenv import load_dotenv

from . import db
from .command_worker import CommandWorker
from .config import Config
from .logging_setup import configure_logging
from .session_manager import SessionManager


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
    await sessions.start_existing_sessions()

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
