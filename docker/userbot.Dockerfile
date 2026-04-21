# =========================================================================
# docker/userbot.Dockerfile — Python 3.12 + uv для apps/userbot (Telethon).
# Контекст сборки: корень репо (Railway: dockerfilePath=docker/userbot.Dockerfile).
# =========================================================================
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libssl3 \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv==0.5.18

WORKDIR /app

COPY apps/userbot/pyproject.toml apps/userbot/uv.lock* ./

RUN uv sync --frozen --no-dev || uv sync --no-dev

COPY apps/userbot/src ./src

ENV PYTHONPATH=/app/src

CMD ["python", "-m", "bb_userbot.main"]
