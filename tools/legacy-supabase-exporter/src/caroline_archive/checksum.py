from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID


def _default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, bytes):
        return value.hex()
    raise TypeError(f"Unsupported canonical JSON type: {type(value).__name__}")


def canonical_json_bytes(value) -> bytes:
    return json.dumps(
        value,
        default=_default,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


@dataclass
class CommutativeChecksum:
    """Order-independent deterministic checksum over a multiset of records.

    Each record is SHA-256 hashed. We combine a modulo-2^256 sum, XOR and count,
    then hash that accumulator. This avoids retaining all rows or sorting them in
    memory while remaining deterministic across cursor/page order.
    """

    count: int = 0
    _sum: int = 0
    _xor: int = 0

    def update(self, value) -> None:
        digest = hashlib.sha256(canonical_json_bytes(value)).digest()
        integer = int.from_bytes(digest, "big")
        self._sum = (self._sum + integer) % (1 << 256)
        self._xor ^= integer
        self.count += 1

    def hexdigest(self) -> str:
        payload = (
            self.count.to_bytes(16, "big")
            + self._sum.to_bytes(32, "big")
            + self._xor.to_bytes(32, "big")
        )
        return hashlib.sha256(payload).hexdigest()


def sha256_file(path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()
