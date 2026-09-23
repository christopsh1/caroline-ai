# Extraction readiness report

Generated for branch: `archive/legacy-supabase-r2-extractor`

## Scope implemented

Safe extraction tooling and documentation only. No real R2 archive write, Supabase mutation, RAG access/change, phone-system change, Worker deployment, Neon migration, cleanup, credential rotation, lifecycle change, or bucket-lock change was performed.

## Policy inventory

- In-scope non-RAG relations with one disposition each: **46**.
- Raw-export allowlist: **26** relations.
- RAG exclusion denylist: **9** relations.
- Prohibited secret sources: **1** (`vault.decrypted_secrets`).
- Derived views blocked from authoritative row export: **2**.

Relations not in the raw-export allowlist remain blocked until a reviewed sanitized transform or explicit owner decision is supplied.

## Tests

Local unit/safety result:

```text
21 passed, 1 skipped
```

The skipped test is optional Parquet parity because `pyarrow` was not installed in the execution environment. The JSONL canonical writer, manifest, policy, R2 collision behavior, secret scanner, redactor and dry-run staging tests passed.

Covered controls:

- every RAG-excluded relation fails with `RAG_EXCLUDED_LEGACY_SURFACE`;
- `vault.decrypted_secrets` fails with `PROHIBITED_SECRET_SOURCE`;
- non-allowlisted relation fails closed;
- derived views cannot be raw exported;
- plan/validate paths do not construct an R2 client;
- synthetic dry-run stages JSONL + redaction report + complete manifest and performs no upload;
- secret-pattern detection covers authorization/bearer material, API/token assignments, private keys, credential-bearing Postgres URLs, Cloudflare/Supabase credential categories and JWT-like values;
- sensitive config fields transform to approved placeholders;
- object-key collision fails before PUT;
- bucket routing is deterministic;
- manifest validates against JSON Schema;
- JSONL row count/checksum is deterministic and order-independent;
- optional Parquet test exists and is enabled when `pyarrow` is installed.

## Secret scanning

Production exporter source, configuration, schemas, documentation, templates and runbooks scanned: **33 files**.

Findings: **0**.

Scanner unit-test fixtures intentionally contain synthetic credential-like strings and are excluded from the production-artifact scan because their purpose is to prove detection.

## Dry-run status

Synthetic dry-run: **passed**.

A live database dry-run using the newly created CLI was **not performed in this implementation pass**, because this environment was not provided a separate runtime `SUPABASE_DB_URL` credential to the local/Codespaces package. The tooling itself is designed to require that read-only credential only at execution time and never log it.

No R2 credential was requested or used.

## External writes

- Git branch/files: **yes**, after local validation, to the dedicated implementation branch only.
- R2 writes: **no**.
- Supabase writes: **no**.
- Supabase RAG row queries by the exporter: **no**.
- RAG changes: **no**.
- Phone/runtime changes: **no**.

## Owner decisions required before a real archive write

1. Approve the exact subset of the 26 raw-export-allowlisted relations for the first archive run.
2. Approve the explicit approved-column sets in `tools/legacy-supabase-exporter/src/caroline_archive/policy.py` and the `--plan` output.
3. Decide whether restricted identity/reference relations currently blocked as `SENSITIVE_EXCLUDE_OR_REDACT` should ever receive a raw private-R2 export or only sanitized contract capture.
4. Decide whether `brain_turn_cache` and `system_doc_revisions`, both `RETAIN_FOR_REVIEW`, should be archived at all. They are blocked by default because they can duplicate contextual/system material that should not cross the RAG boundary accidentally.
5. Approve read-only Supabase credential scope and create-only/non-delete R2 credential scope outside Git/chat.
6. Invoke the exact `--confirm-archive-write` mode for the approved relation set.

No cleanup or retirement decision is implied by archive readiness.
