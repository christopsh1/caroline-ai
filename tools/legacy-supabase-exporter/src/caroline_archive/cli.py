from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .errors import ArchiveError
from .exporter import r2_client_from_env, stage_export, upload_staged
from .manifest import load_schema, manifest_digest, validate_manifest
from .checksum import sha256_file
from .policy import (
    DERIVED_VIEWS,
    IN_SCOPE_RELATIONS,
    POLICIES,
    PROHIBITED_SECRET_RELATIONS,
    RAG_EXCLUDED_RELATIONS,
    RAW_EXPORT_ALLOWLIST,
    SANITIZED_TEMPLATE_ALLOWLIST,
    assert_relation_safe,
)
from .source import ReadOnlySupabaseSource


def verify_local_manifest(manifest_path: str | Path) -> dict:
    path = Path(manifest_path)
    manifest = json.loads(path.read_text(encoding="utf-8"))
    validate_manifest(manifest)
    expected_manifest_digest = manifest["integrity"]["manifest_sha256"]
    actual_manifest_digest = "sha256:" + manifest_digest(manifest)
    if expected_manifest_digest != actual_manifest_digest:
        raise ValueError("manifest canonical SHA-256 mismatch")
    verified = []
    for obj in manifest["objects"]:
        local = path.parent / Path(obj["key"]).name
        if not local.is_file():
            raise ValueError(f"missing staged object: {local.name}")
        if local.stat().st_size != obj["size_bytes"]:
            raise ValueError(f"size mismatch: {local.name}")
        actual = "sha256:" + sha256_file(local)
        if actual != obj["sha256"]:
            raise ValueError(f"SHA-256 mismatch: {local.name}")
        verified.append(local.name)
    return {"ok": True, "manifest": str(path), "verified_objects": verified, "r2_writes": False}


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Caroline legacy non-RAG Supabase archive exporter")
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument("--plan", action="store_true", help="Print static relation plan; no database or R2 access")
    modes.add_argument("--validate", action="store_true", help="Validate policy/schema invariants; no R2 write")
    modes.add_argument("--dry-run", action="store_true", help="Stage local archive files from read-only Supabase; no R2 write")
    modes.add_argument("--confirm-archive-write", action="store_true", help="Stage and upload create-only R2 archive objects")
    modes.add_argument("--verify", action="store_true", help="Validate a local manifest/file set; no R2 write")
    modes.add_argument("--restore-test-plan", action="store_true", help="Print isolated restore-test plan; no restore performed")
    p.add_argument("--relation", action="append", default=[], help="Relation to process; repeat for multiple relations")
    p.add_argument("--output-dir", default=".archive-staging", help="Local staging directory")
    p.add_argument("--manifest", help="Manifest path for --verify")
    p.add_argument("--parquet", action="store_true", help="Also create Parquet (requires optional dependency)")
    return p


def plan_payload() -> dict:
    return {
        "in_scope_relations": sorted(IN_SCOPE_RELATIONS),
        "raw_export_allowlist": sorted(RAW_EXPORT_ALLOWLIST),
        "sanitized_template_allowlist": sorted(SANITIZED_TEMPLATE_ALLOWLIST),
        "rag_excluded_relations": sorted(RAG_EXCLUDED_RELATIONS),
        "prohibited_secret_relations": sorted(PROHIBITED_SECRET_RELATIONS),
        "derived_views": sorted(DERIVED_VIEWS),
        "relations": {
            name: {
                "disposition": p.disposition,
                "sensitivity": p.sensitivity,
                "bucket": p.bucket,
                "category": p.category,
                "raw_export_allowed": p.raw_export_allowed,
                "template": p.template,
            }
            for name, p in sorted(POLICIES.items())
        },
        "external_writes": False,
    }


def validate_policy() -> dict:
    if set(POLICIES) != set(IN_SCOPE_RELATIONS):
        raise ValueError("Every in-scope relation must have exactly one policy")
    if RAW_EXPORT_ALLOWLIST & RAG_EXCLUDED_RELATIONS:
        raise ValueError("RAG exclusion overlaps raw export allowlist")
    if RAW_EXPORT_ALLOWLIST & PROHIBITED_SECRET_RELATIONS:
        raise ValueError("secret relation overlaps raw export allowlist")
    schema = load_schema()
    if schema.get("properties", {}).get("manifest_version", {}).get("const") != "caroline.archive.v1":
        raise ValueError("unexpected manifest schema version")
    return {
        "ok": True,
        "policy_relations": len(POLICIES),
        "raw_export_relations": len(RAW_EXPORT_ALLOWLIST),
        "rag_excluded_relations": len(RAG_EXCLUDED_RELATIONS),
        "prohibited_secret_relations": len(PROHIBITED_SECRET_RELATIONS),
        "r2_writes": False,
        "supabase_writes": False,
    }


def _require_relations(relations: list[str]) -> list[str]:
    if not relations:
        raise ValueError("At least one --relation is required for dry-run/archive-write")
    return [assert_relation_safe(r, operation="row_export") for r in relations]


def restore_plan() -> dict:
    return {
        "status": "planned_only",
        "container": "postgres:17",
        "network": "isolated/no production provider credentials",
        "inputs": "read-only approved archive objects after checksum verification",
        "requirements": [
            "no production Supabase write credential",
            "no Twilio/ElevenLabs/Telegram credentials",
            "no R2 writer credential",
            "validate manifest and object SHA-256 before load",
            "restore only approved non-RAG relation data",
            "destroy temporary database after evidence report",
        ],
        "external_writes": False,
    }


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.plan:
            print(json.dumps(plan_payload(), indent=2, sort_keys=True))
            return 0
        if args.validate:
            print(json.dumps(validate_policy(), indent=2, sort_keys=True))
            return 0
        if args.restore_test_plan:
            print(json.dumps(restore_plan(), indent=2, sort_keys=True))
            return 0
        if args.verify:
            if not args.manifest:
                raise ValueError("--manifest is required with --verify")
            print(json.dumps(verify_local_manifest(args.manifest), indent=2))
            return 0

        relations = _require_relations(args.relation)
        db_url = os.environ.get("SUPABASE_DB_URL", "")
        source = ReadOnlySupabaseSource(db_url)
        staged = [stage_export(source, relation, args.output_dir, parquet=args.parquet) for relation in relations]

        if args.dry_run:
            print(json.dumps({
                "mode": "dry-run",
                "staged": [
                    {"relation": x.relation, "export_id": x.export_id, "bucket": x.bucket, "prefix": x.prefix, "manifest": str(x.manifest_path)}
                    for x in staged
                ],
                "r2_writes": False,
                "supabase_writes": False,
            }, indent=2))
            return 0

        # This branch can only be reached via the exact explicit confirmation mode.
        client = r2_client_from_env(confirmed=True)
        results = [upload_staged(item, client) for item in staged]
        print(json.dumps({"mode": "archive-write", "results": results, "r2_writes": True, "supabase_writes": False}, indent=2))
        return 0
    except ArchiveError as exc:
        print(exc.code, file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
