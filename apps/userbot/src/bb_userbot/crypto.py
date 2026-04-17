"""AES-256-GCM — совместимо с `packages/shared-ts/src/crypto.ts` (формат `v1:iv:tag:ct`)."""

from __future__ import annotations

import base64
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_VERSION = "v1"
_IV_LEN = 12


def _resolve_key(raw: str) -> bytes:
    try:
        decoded = base64.b64decode(raw, validate=True)
        if len(decoded) == 32:
            return decoded
    except Exception:  # noqa: BLE001
        pass
    return hashlib.sha256(raw.encode("utf-8")).digest()


def encrypt_secret(key: str, plaintext: str) -> str:
    aes = AESGCM(_resolve_key(key))
    import os

    iv = os.urandom(_IV_LEN)
    ct_and_tag = aes.encrypt(iv, plaintext.encode("utf-8"), None)
    ct = ct_and_tag[:-16]
    tag = ct_and_tag[-16:]
    return ":".join(
        [
            _VERSION,
            base64.b64encode(iv).decode("ascii"),
            base64.b64encode(tag).decode("ascii"),
            base64.b64encode(ct).decode("ascii"),
        ]
    )


def decrypt_secret(key: str, payload: str) -> str:
    parts = payload.split(":")
    if len(parts) != 4 or parts[0] != _VERSION:
        raise ValueError("Unsupported or corrupted encrypted payload")
    iv = base64.b64decode(parts[1])
    tag = base64.b64decode(parts[2])
    ct = base64.b64decode(parts[3])
    aes = AESGCM(_resolve_key(key))
    return aes.decrypt(iv, ct + tag, None).decode("utf-8")


def is_encrypted_payload(value: str | None) -> bool:
    return bool(value) and value.startswith(f"{_VERSION}:")  # type: ignore[union-attr]
