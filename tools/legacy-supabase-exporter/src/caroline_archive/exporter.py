from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import __version__
from .keys import new_ulid, relation_prefix
from .manifest import build_manifest, dump_manifest, validate_manifest
from .policy import POLICIES, assert_raw_export_allowed
from .r2 import R2ArchiveClient
from .secret_scan import assert_clean_file, assert_clean_text
from .source import ReadOnlySupabaseSource
from .writers import WriteResult, write_jsonl_gz, write_parquet_from_jsonl_gz


@dataclass(frozen=True)
class StagedExport:
    relation: str
    export_id: str
    bucket: str
    prefix: str
    directory: Path
    manifest_path: Path
    manifest: dict[str, Any]
    data_objects: list[tuple[Path, str, str]]  # local path, key, content type


def _object_entry(bucket: str, key: str, result: WriteResult, fmt: str, compression: str) -> dict[str, Any]:
    return {
        "bucket": bucket,
        "key": key,
        "format": fmt,
        "compression": compression,
        "size_bytes": result.path.stat().st_size,
        "sha256": f"sha256:{result.sha256}",
        "row_count": result.row_count,
    }


def stage_export(
    source: ReadOnlySupabaseSource,
    relation: str,
    output_dir: str | Path,
    *,
    export_id: str | None = None,
    parquet: bool = False,
) -> StagedExport:
    relation = assert_raw_export_allowed(relation)
    export_id = export_id or new_ulid()
    bucket, prefix = relation_prefix(relation, export_id)
    base = Path(output_dir) / relation / f"export={export_id}"
    base.mkdir(parents=True, exist_ok=False)

    jsonl_path = base / "data-00001.jsonl.gz"
    with source.export_stream(relation) as (description, rows):
        json_result = write_jsonl_gz(rows, jsonl_path, description["primary_key"])

    data_objects: list[tuple[Path, str, str]] = []
    entries: list[dict[str, Any]] = []
    json_key = f"{prefix}/data-00001.jsonl.gz"
    data_objects.append((jsonl_path, json_key, "application/gzip"))
    entries.append(_object_entry(bucket, json_key, json_result, "jsonl", "gzip"))

    if parquet:
        parquet_path = base / "data-00001.parquet"
        parquet_result = write_parquet_from_jsonl_gz(jsonl_path, parquet_path)
        if parquet_result.row_count != json_result.row_count:
            raise RuntimeError("Parquet row count does not match JSONL row count")
        parquet_key = f"{prefix}/data-00001.parquet"
        data_objects.append((parquet_path, parquet_key, "application/vnd.apache.parquet"))
        entries.append(_object_entry(bucket, parquet_key, parquet_result, "parquet", "zstd"))

    removed_columns = sorted(set(description.get("actual_columns", [])) - set(description["columns"]))
    report = {
        "policy_version": "caroline.export-redaction.v1",
        "relation": relation,
        "selection_strategy": "explicit approved-column allowlist; omitted columns are never selected",
        "removed_columns": removed_columns,
        "transformed_columns": [],
        "legacy_value_exported_for_removed_fields": False,
    }
    report_text = json.dumps(report, sort_keys=True, indent=2) + "\n"
    assert_clean_text(report_text, label="redaction-report")
    report_path = base / "redaction-report.json"
    report_path.write_text(report_text, encoding="utf-8")
    report_key = f"{prefix}/redaction-report.json"
    report_result = WriteResult(report_path, 0, __import__("hashlib").sha256(report_path.read_bytes()).hexdigest(), "")
    data_objects.append((report_path, report_key, "application/json"))
    entries.append(_object_entry(bucket, report_key, report_result, "json", "none"))

    # Files are scanned before a manifest is considered valid. Row content was scanned while writing.
    assert_clean_file(report_path)
    source_query_description = f"SELECT approved columns from public.{relation}; credentials and excluded columns omitted"
    manifest = build_manifest(
        relation=relation,
        export_id=export_id,
        exporter_version=__version__,
        schema_fingerprint=description["schema_fingerprint"],
        source_query_description=source_query_description,
        watermark_column=None,
        watermark_through=None,
        row_count=json_result.row_count,
        primary_key_columns=description["primary_key"],
        primary_key_checksum=json_result.primary_key_checksum,
        object_entries=entries,
        removed_columns=removed_columns,
        transformed_columns=[],
        secret_scan_passed=True,
        readback_verified=False,
    )
    manifest_path = base / "manifest.json"
    manifest_text = dump_manifest(manifest)
    assert_clean_text(manifest_text, label="manifest")
    manifest_path.write_text(manifest_text, encoding="utf-8")
    return StagedExport(relation, export_id, bucket, prefix, base, manifest_path, manifest, data_objects)


def upload_staged(staged: StagedExport, client: R2ArchiveClient) -> dict[str, Any]:
    # All data/report objects are uploaded and read-back verified first.
    verified = []
    for path, key, content_type in staged.data_objects:
        verified.append(client.upload_new(staged.bucket, key, path, content_type=content_type))

    # Manifest is uploaded last, only after every referenced object was verified.
    manifest = dict(staged.manifest)
    manifest["integrity"] = dict(manifest["integrity"])
    manifest["integrity"]["readback_verified"] = True
    from .manifest import manifest_digest
    manifest["integrity"]["manifest_sha256"] = "sha256:" + manifest_digest(manifest)
    validate_manifest(manifest)
    text = dump_manifest(manifest)
    assert_clean_text(text, label="manifest-final")
    staged.manifest_path.write_text(text, encoding="utf-8")
    manifest_key = f"{staged.prefix}/manifest.json"
    manifest_verify = client.upload_new(staged.bucket, manifest_key, staged.manifest_path, content_type="application/json")
    return {
        "relation": staged.relation,
        "export_id": staged.export_id,
        "bucket": staged.bucket,
        "prefix": staged.prefix,
        "data_objects_verified": len(verified),
        "manifest_key": manifest_key,
        "manifest_verified": manifest_verify["readback_verified"],
    }


def r2_client_from_env(*, confirmed: bool) -> R2ArchiveClient:
    endpoint = os.environ.get("R2_ENDPOINT_URL", "")
    access = os.environ.get("R2_ACCESS_KEY_ID", "")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY", "")
    if not endpoint or not access or not secret:
        raise ValueError("R2_ENDPOINT_URL, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required for archive writes")
    return R2ArchiveClient(endpoint_url=endpoint, access_key_id=access, secret_access_key=secret, confirmed=confirmed)
