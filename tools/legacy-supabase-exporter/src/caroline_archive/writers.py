from __future__ import annotations

import gzip
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .checksum import CommutativeChecksum, canonical_json_bytes, sha256_file
from .secret_scan import assert_clean_text

@dataclass(frozen=True)
class WriteResult:
    path: Path
    row_count: int
    sha256: str
    primary_key_checksum: str


def write_jsonl_gz(rows: Iterable[dict], path: str | Path, primary_key_columns: list[str]) -> WriteResult:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pk_checksum = CommutativeChecksum()
    row_checksum = CommutativeChecksum()
    count = 0
    with gzip.open(path, "wt", encoding="utf-8", newline="\n", compresslevel=9) as handle:
        for row in rows:
            text = canonical_json_bytes(row).decode("utf-8")
            assert_clean_text(text, label=f"row:{count + 1}")
            handle.write(text + "\n")
            count += 1
            row_checksum.update(row)
            if primary_key_columns:
                pk_checksum.update([row.get(column) for column in primary_key_columns])
    checksum = pk_checksum.hexdigest() if primary_key_columns else row_checksum.hexdigest()
    return WriteResult(path, count, sha256_file(path), checksum)


def write_parquet_from_jsonl_gz(jsonl_path: str | Path, parquet_path: str | Path, *, batch_size: int = 1000) -> WriteResult:
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise RuntimeError("Parquet output requires: pip install '.[parquet]'") from exc

    parquet_path = Path(parquet_path)
    parquet_path.parent.mkdir(parents=True, exist_ok=True)
    writer = None
    rows: list[dict] = []
    count = 0
    with gzip.open(jsonl_path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
            if len(rows) >= batch_size:
                table = pa.Table.from_pylist(rows)
                if writer is None:
                    writer = pq.ParquetWriter(parquet_path, table.schema, compression="zstd")
                else:
                    table = table.cast(writer.schema)
                writer.write_table(table)
                count += len(rows)
                rows = []
        if rows:
            table = pa.Table.from_pylist(rows)
            if writer is None:
                writer = pq.ParquetWriter(parquet_path, table.schema, compression="zstd")
            else:
                table = table.cast(writer.schema)
            writer.write_table(table)
            count += len(rows)
    if writer is None:
        # Empty relation: make a valid empty parquet with no columns.
        table = pa.table({})
        pq.write_table(table, parquet_path, compression="zstd")
    else:
        writer.close()
    return WriteResult(parquet_path, count, sha256_file(parquet_path), "")
