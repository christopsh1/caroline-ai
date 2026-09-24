# Extraction readiness report

Branch: `archive/legacy-supabase-r2-extractor`

Current state: **ready for credential-bound live dry-run**. No real R2 archive write has been performed.

## Scope implemented

Safe extraction tooling and documentation only. No Supabase mutation, RAG access/change, phone-system change, Worker deployment, Neon migration, cleanup, credential rotation, R2 lifecycle change, or bucket-lock change was performed.

## Policy inventory

- In-scope non-RAG relations with one disposition each: **46**.
- Owner-approved raw-export allowlist: **26** relations.
- RAG exclusion denylist: **9** relations.
- Prohibited secret sources: **1** (`vault.decrypted_secrets`).
- Derived views blocked from authoritative row export: **2**.

The complete 26-relation raw-export set and existing redaction policy are owner-approved. Communications (`call_history`, `call_turns`, `sms_history`) remain classified `restricted` but are approved for private archive export.

Relations outside the raw-export allowlist remain fail-closed unless they use their separately reviewed sanitized/template path. Owner approval does not bypass RAG or secret exclusions.

## Live source validation

Read-only validation against Supabase project `drsyygxqwxuyoyjbsaqs` confirmed:

- all 26 approved relations currently exist;
- all 26 have stable primary keys;
- all exporter-approved selected columns exist in the live schema;
- current total source rows across the approved set: **453**;
- `call_history`: **52** rows;
- `call_turns`: **98** rows;
- `sms_history`: **0** rows.

These counts are validation evidence only. Real archive manifests must use counts and checksums observed inside each relation's read-only repeatable-read export transaction.

The approved-column schema check required metadata only and did not query excluded RAG relations or `vault.decrypted_secrets`.

## Archive run identity

A multi-relation dry-run or write now generates **one immutable ULID for the entire run**. Every approved relation in that run uses the same `export=<ULID>` identifier while retaining a separate dataset manifest and checksum.

## Tests

Last completed local unit/safety suite before the single-run ULID hardening:

```text
22 passed, 1 skipped
```

The skip was optional Parquet parity because `pyarrow` was not installed in that environment.

A regression test for one-run/one-ULID behavior has since been added. A test-only GitHub Actions workflow has also been added to run static validation and `pytest` without Supabase or R2 credentials. That new CI/local regression run is still pending; this report does not claim it has executed.

Previously validated controls include:

- every RAG-excluded relation fails with `RAG_EXCLUDED_LEGACY_SURFACE`;
- `vault.decrypted_secrets` fails with `PROHIBITED_SECRET_SOURCE`;
- non-allowlisted relation fails closed;
- derived views cannot be raw exported;
- plan/validate paths do not construct an R2 client;
- synthetic dry-run stages JSONL + redaction report + complete manifest and performs no upload;
- local verify detects staged-object size/SHA-256 tampering;
- secret-pattern detection covers authorization/bearer material, API/token assignments, private keys, credential-bearing Postgres URLs, Cloudflare/Supabase credential categories and JWT-like values;
- sensitive config fields transform to approved placeholders;
- object-key collision fails before PUT;
- bucket routing is deterministic;
- manifest validates against JSON Schema;
- JSONL row count/checksum is deterministic and order-independent.

## Dry-run and write runner

The owner-approved full relation set is encoded in:

```text
tools/legacy-supabase-exporter/scripts/run-approved-set.sh
```

Default/safe next execution:

```bash
bash scripts/run-approved-set.sh dry-run
```

Real archive write, after the dry-run succeeds and all runtime bindings exist:

```bash
bash scripts/run-approved-set.sh write
```

The write runner reaches the R2 path only through the exporter's explicit `--confirm-archive-write` mode.

## Remaining runtime bindings

A live dry-run requires runtime-only:

```text
SUPABASE_DB_URL
```

A real archive write additionally requires:

```text
R2_ENDPOINT_URL
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

The exact Supabase Session pooler connection string should be copied from the Caroline project's **Connect** panel after the database password is known/reset. Secret values must remain outside Git, chat, manifests, logs, and reports.

## External writes/status

- Git branch/files: **yes**, dedicated archive tooling branch only.
- R2 writes: **no**.
- Supabase writes: **no**.
- Supabase RAG row queries by the exporter: **no**.
- RAG changes: **no**.
- Phone/runtime changes: **no**.

## Remaining gate

No further relation/redaction approval is required for the current 26-relation raw-export set.

The remaining gate is operational only: provide the runtime secret bindings, execute the full approved-set live dry-run, verify the staged manifests/checksums/secret scan, and then execute the explicitly confirmed archive write.

No cleanup, retirement, deletion, or runtime cutover is implied by archive readiness.
