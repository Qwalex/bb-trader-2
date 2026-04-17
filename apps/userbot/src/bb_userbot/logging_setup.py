"""structlog + JSON output (для Railway) с маскировкой секретов в payload."""

from __future__ import annotations

import logging
import sys

import structlog

_SECRET_SUBSTRINGS = (
    "session_string",
    "sessionString",
    "api_secret",
    "apiSecret",
    "bot_token",
    "password",
    "encryption_key",
    "encryptionKey",
)


def _mask_secrets(_logger: object, _method: str, event_dict: dict) -> dict:  # type: ignore[type-arg]
    for key in list(event_dict.keys()):
        lower_key = key.lower()
        if any(s.lower() in lower_key for s in _SECRET_SUBSTRINGS):
            event_dict[key] = "***"
    return event_dict


def configure_logging(level: str = "info") -> None:
    log_level = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _mask_secrets,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
