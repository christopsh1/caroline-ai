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
- Every multi-relation run uses one fresh immutable `export=<ULID>` across the complete run.
- Every upload performs HEAD collision detection, conditional create, and read-back SHA-256 verification.
- The per-relation manifest is uploaded last.

## Owner approval status

The complete current 26-relation raw-export allowlist and existing redaction policy were owner-approved on 2026-09-23. The approval is recorded in `docs/legacy-supabase/archive-approval.md`.

The approval does **not** change the RAG exclusion denylist or the prohibited secret-source boundary.

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

## Runtime bindings

Required for any live source read:

```text
SUPABASE_DB_URL
```

Use the **Session pooler** connection string shown by the Caroline project **Connect** panel. It has the form:

```text
postgresql://postgres.drsyygxqwxuyoyjbsaqs:[YOUR-PASSWORD]@<SESSION-POOLER-HOST>:5432/postgres
```

Do not infer or commit the pooler host or password; copy the exact current Session pooler string from Supabase and place the completed value in the secret store.

Required only for a real R2 archive write:

```text
R2_ENDPOINT_URL
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

The R2 credentials must be scoped outside Git/chat. The exporter targets the existing private buckets and does not create, rename, delete, or reconfigure them.

## Exact modes

### Plan — no database, no R2

```bash
caroline-archive --plan
```

### Validate policy/schema — no R2

```bash
caroline-archive --validate
```

### Full approved-set dry run — recommended next step

After `SUPABASE_DB_URL` is present in the runtime secret store:

```bash
bash scripts/run-approved-set.sh dry-run
```

This stages all 26 owner-approved relations locally under one run ULID and performs **no R2 write**.

### Single-relation dry run

```bash
caroline-archive --dry-run --relation events_processed --output-dir .archive-staging
```

Optional Parquet:

```bash
caroline-archive --dry-run --relation events_processed --parquet --output-dir .archive-staging
```

### Approved full archive write — the only R2-write path

After the dry-run passes and all four runtime bindings are present:

```bash
bash scripts/run-approved-set.sh write
```

The runner reaches the archive-write path only through the CLI's exact `--confirm-archive-write` mode.

Equivalent direct single-relation form:

```bash
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

The suite verifies the fail-closed RAG/secret boundaries, no-write modes, scanner/redaction behavior, deterministic checksum, manifest validation, routing, collision protection, JSONL fidelity, one-run/one-ULID behavior, and optional Parquet row parity.

## Important limitation

`--dry-run` and `--confirm-archive-write` support only the explicit raw-export allowlist. Relations marked `TEMPLATE_EXTRACTION_ONLY`, `SENSITIVE_EXCLUDE_OR_REDACT`, `RETAIN_FOR_REVIEW`, or derived views are intentionally not row-exportable by this CLI. Sanitized template/config artifacts must be generated through a separately reviewed transformation, not by bypassing the raw-export guard.
