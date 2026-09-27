from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from importlib.resources import files
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from .checksum import canonical_json_bytes
from .policy import PROJECT_REF, POLICIES, RAG_EXCLUDED_RELATIONS, PROHIBITED_SECRET_RELATIONS


def load_schema() -> dict[str, Any]:
    schema_path = files("caroline_archive").joinpath("schemas/archive-manifest.schema.json")
    return json.loads(schema_path.read_text(encoding="utf-8"))


def validate_manifest(manifest: dict[str, Any]) -> None:
    validator = Draft202012Validator(load_schema(), format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(manifest), key=lambda e: list(e.absolute_path))
    if errors:
        rendered = "; ".join(f"{'.'.join(map(str, e.absolute_path)) or '$'}: {e.message}" for e in errors)
        raise ValueError(f"manifest validation failed: {rendered}")


def _boolish(value: str) -> bool:
    return value == "yes"


def _category(relation: str) -> str:
    policy = POLICIES[relation]
    if policy.bucket == "caroline-events-raw":
        return "event"
    if policy.bucket == "caroline-transcripts":
        return "transcript"
    if policy.bucket == "caroline-media":
        return "media"
    if policy.category == "reference":
        return "reference"
    return "artifact"


def build_manifest(
    *,
    relation: str,
    export_id: str,
    exporter_version: str,
    schema_fingerprint: str,
    source_query_description: str,
    watermark_column: str | None,
    watermark_through: str | None,
    row_count: int,
    primary_key_columns: list[str],
    primary_key_checksum: str,
    object_entries: list[dict[str, Any]],
    removed_columns: list[str] | None = None,
    transformed_columns: list[str] | None = None,
    secret_scan_passed: bool = False,
    readback_verified: bool = False,
) -> dict[str, Any]:
    policy = POLICIES[relation]
    manifest: dict[str, Any] = {
        "manifest_version": "caroline.archive.v1",
        "export_id": export_id,
        "archive_purpose": "legacy_supabase_reference_only",
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "created_by": f"caroline-legacy-archive/{exporter_version}",
        "source": {
            "provider": "supabase",
            "project_ref": PROJECT_REF,
            "schema": "public",
            "relation": relation,
            "relation_type": "table",
            "source_schema_fingerprint": f"sha256:{schema_fingerprint}",
            "extraction_method": "repeatable_read_allowlisted_export",
            "source_query_redacted": source_query_description,
            "watermark": {
                "column": watermark_column,
                "from_exclusive": None,
                "through_inclusive": watermark_through,
            },
        },
        "classification": {
            "archive_category": _category(relation),
            "sensitivity": policy.sensitivity,
            "contains_pii": _boolish(policy.pii),
            "contains_communications": _boolish(policy.communications),
            "contains_prompt_text": _boolish(policy.prompt_ip),
            "contains_provider_identifiers": _boolish(policy.provider_refs),
            "contains_credentials": False,
            "contains_secret_references": _boolish(policy.secret_ref_risk),
            "template_relevance": "high" if policy.template else "low",
        },
        "redaction": {
            "performed": bool(removed_columns or transformed_columns),
            "policy_version": "caroline.export-redaction.v1",
            "removed_columns": sorted(set(removed_columns or [])),
            "transformed_columns": sorted(set(transformed_columns or [])),
            "secret_scan_passed": secret_scan_passed,
            "prohibited_sources_checked": sorted(PROHIBITED_SECRET_RELATIONS | RAG_EXCLUDED_RELATIONS),
        },
        "dataset": {
            "row_count": row_count,
            "primary_key_columns": primary_key_columns,
            "primary_key_checksum_algorithm": "sha256",
            "primary_key_checksum": f"sha256:{primary_key_checksum}",
        },
        "objects": object_entries,
        "integrity": {
            "manifest_sha256": "sha256:" + "0" * 64,
            "readback_verified": readback_verified,
            "restore_test_status": "pending",
            "restore_test_report_key": None,
        },
        "runtime_policy": {
            "production_system_of_record": False,
            "runtime_reads_allowed": False,
            "rag_direct_reads_allowed": False,
            "restore_requires_owner_approval": True,
        },
    }
    manifest["integrity"]["manifest_sha256"] = "sha256:" + manifest_digest(manifest)
    validate_manifest(manifest)
    return manifest


def manifest_digest(manifest: dict[str, Any]) -> str:
    copy = deepcopy(manifest)
    copy.setdefault("integrity", {})["manifest_sha256"] = "sha256:" + "0" * 64
    return hashlib.sha256(canonical_json_bytes(copy)).hexdigest()


def dump_manifest(manifest: dict[str, Any]) -> str:
    validate_manifest(manifest)
    return json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
