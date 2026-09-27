from __future__ import annotations

import os
import time

from .policy import PROJECT_REF, POLICIES, assert_relation_safe

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _encode_base32(value: int, length: int) -> str:
    chars = ["0"] * length
    for i in range(length - 1, -1, -1):
        chars[i] = _ALPHABET[value & 31]
        value >>= 5
    return "".join(chars)


def new_ulid(timestamp_ms: int | None = None, randomness: bytes | None = None) -> str:
    timestamp_ms = int(time.time() * 1000) if timestamp_ms is None else timestamp_ms
    if not 0 <= timestamp_ms < (1 << 48):
        raise ValueError("ULID timestamp out of range")
    randomness = os.urandom(10) if randomness is None else randomness
    if len(randomness) != 10:
        raise ValueError("ULID randomness must be exactly 10 bytes")
    value = (timestamp_ms << 80) | int.from_bytes(randomness, "big")
    return _encode_base32(value, 26)


def relation_prefix(relation: str, export_id: str) -> tuple[str, str]:
    relation = assert_relation_safe(relation)
    policy = POLICIES[relation]
    if not policy.bucket or not policy.category:
        raise ValueError(f"{relation} has no R2 target")
    if policy.bucket == "caroline-events-raw":
        prefix = f"supabase/{PROJECT_REF}/events/{relation}/export={export_id}"
    elif policy.bucket == "caroline-transcripts":
        prefix = f"supabase/{PROJECT_REF}/communications/{relation}/export={export_id}"
    elif policy.bucket == "caroline-artifacts":
        prefix = f"supabase/{PROJECT_REF}/{policy.category}/{relation}/export={export_id}"
    elif policy.bucket == "caroline-media":
        prefix = f"supabase/{PROJECT_REF}/media/{relation}/export={export_id}"
    else:
        raise ValueError(f"Unknown bucket {policy.bucket}")
    return policy.bucket, prefix
