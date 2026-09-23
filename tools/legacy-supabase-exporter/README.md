# Caroline legacy Supabase → R2 exporter

Safety-first local/Codespaces tooling for archiving **approved non-RAG** data from legacy Supabase project `drsyygxqwxuyoyjbsaqs`.

## Hard boundaries

- No Supabase writes exist in this package.
- Nine legacy RAG relations are rejected before any row query with `RAG_EXCLUDED_LEGACY_SURFACE`.
- `vault.decrypted_secrets` is rejected before any query with `PROHIBITED_SECRET_SOURCE`.
- Non-allowlisted relations fail closed.
- Raw exports use explicit approved-column allowlists.
- R2 upload is impossible unless the exact `--confirm-archive-write` mode is selected.
- R2 writer exposes no delete method and no overwrite option.
- Every object key is immutable under a fresh `export=<ULID>` prefix.
- Every upload performs HEAD collision detection, conditional create, and read-back SHA-256 verification.
- The manifest is uploaded last.

## Installation

```bash
cd tools/legacy-supabase-exporter
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
# Optional analytical Parquet:
pip install -e '.[dev,parquet]'
```

Do not put credentials in command arguments, files, Git remotes, manifests, or logs. Supply runtime secrets through the Codespace/local secret store or environment.

## Exact modes

### Plan — no database, no R2

```bash
caroline-archive --plan
```

### Validate policy/schema — no R2

```bash
caroline-archive --validate
```

### Dry run — read-only Supabase, local staging only

```bash
export SUPABASE_DB_URL='${SECRET_STORE_BINDING_REQUIRED}'
caroline-archive --dry-run --relation events_processed --output-dir .archive-staging
```

Optional Parquet:

```bash
caroline-archive --dry-run --relation events_processed --parquet --output-dir .archive-staging
```

### Approved archive write — the only R2-write mode

This must not be run until the owner approves the exact relations, redaction policy, and credential scope.

```bash
export SUPABASE_DB_URL='${SECRET_STORE_BINDING_REQUIRED}'
export R2_ENDPOINT_URL='${PROVIDER_ENDPOINT_CONFIGURED_EXTERNALLY}'
export R2_ACCESS_KEY_ID='${SECRET_STORE_BINDING_REQUIRED}'
export R2_SECRET_ACCESS_KEY='${SECRET_STORE_BINDING_REQUIRED}'

caroline-archive \
  --confirm-archive-write \
  --relation events_processed \
  --output-dir .archive-staging
```

### Verify a local manifest — no R2 write

```bash
caroline-archive --verify --manifest .archive-staging/<relation>/export=<ULID>/manifest.json
```

### Restore-test plan — no restore is performed

```bash
caroline-archive --restore-test-plan
```

## Tests

```bash
pytest
```

The suite verifies the fail-closed RAG/secret boundaries, no-write modes, scanner/redaction behavior, deterministic checksum, manifest validation, routing, collision protection, JSONL fidelity, and optional Parquet row parity.

## Important limitation

`--dry-run` and `--confirm-archive-write` support only the explicit raw-export allowlist. Relations marked `TEMPLATE_EXTRACTION_ONLY`, `SENSITIVE_EXCLUDE_OR_REDACT`, `RETAIN_FOR_REVIEW`, or derived views are intentionally not row-exportable by this CLI. Sanitized template/config artifacts must be generated through a separately reviewed transformation, not by bypassing the raw-export guard.
