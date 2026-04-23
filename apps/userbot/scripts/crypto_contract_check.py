from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from bb_userbot.crypto import decrypt_secret  # noqa: E402


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: crypto_contract_check.py <key> <ciphertext>")
    key = sys.argv[1]
    ciphertext = sys.argv[2]
    plain = decrypt_secret(key, ciphertext)
    print(json.dumps({"plain": plain}))


if __name__ == "__main__":
    os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
    main()
