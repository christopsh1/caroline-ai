# Caroline Legacy Supabase → R2 Final Extraction Report

Date: 2026-09-24

Status: **COMPLETE — archive/reference extraction finished and independently validated**

Branch: `archive/legacy-supabase-r2-extractor`

Source project: `drsyygxqwxuyoyjbsaqs`

Archive run ID: `01M3A2HCA9BFSK5PB5MF26EFKE`

## Outcome

The owner-approved non-RAG legacy extraction is complete.

- Approved raw-export relations archived: **26 / 26**.
- Archived snapshot rows: **458**.
- Distinct archive run IDs: **1**.
- Per-relation manifests present and valid: **26 / 26**.
- Per-relation R2 write/read-back verification: **passed**.
- Independent post-write R2 re-download verification: **passed**.
- Existing legacy RAG exported: **no**.
- Existing legacy RAG changed: **no**.
- `vault.decrypted_secrets` queried/exported: **no**.

The source remained active during preparation, so the final archive used a fresh point-in-time snapshot rather than the earlier 453-row planning count. The completed run contains 458 approved rows.

## Communications snapshot

- `call_history`: **53** rows.
- `call_turns`: **99** rows.
- `sms_history`: **0** rows.

These records are archived as restricted historical/reference material only. They are not runtime state and are not a future RAG source by default.

## Central R2 evidence

Bucket: `caroline-artifacts`

Run manifest:

`supabase/drsyygxqwxuyoyjbsaqs/manifests/01M3A2HCA9BFSK5PB5MF26EFKE/run-manifest.json`

SHA-256:

`3cc0dd98ec80eb51b76fd5fe421aa3a8a4945ebe601ac18861633e6a86ceb43c`

Validation report:

`supabase/drsyygxqwxuyoyjbsaqs/validation/01M3A2HCA9BFSK5PB5MF26EFKE/run-validation.json`

SHA-256:

`568ffc7f1561cecce7b9bd27e2753251c8ab2c7c1c88cf8e932d01d4a9ec71d3`

Both central evidence objects were created only after all 26 relation archives were validated, then downloaded again and SHA-256 compared successfully.

## Bucket routing completed

`caroline-events-raw` contains approved event/audit/queue/telemetry history, including agent runs/improvements, Airtable sync jobs, brain-turn metrics, processed events, phone admission events, scheduled actions, and transcript-ingestion jobs.

`caroline-transcripts` contains the approved historical communication ledgers: `call_history`, `call_turns`, and the empty `sms_history` snapshot.

`caroline-artifacts` contains approved reference datasets, per-relation redaction reports, and the central run/validation evidence.

`caroline-media` was not populated by this migration because the known Supabase Storage inventory was empty and no external Twilio/ElevenLabs media copy was authorized.

## RAG exclusion boundary preserved

The following relations were not exported or queried for archive content:

- `documents`
- `document_chunks`
- `system_docs`
- `corpus_health_log`
- `interaction_chunks`
- `agent_memory`
- `memory_items`
- `contact_profile_items`
- `call_transcript_chunks`

The exporter/bridge retained the required failure identity `RAG_EXCLUDED_LEGACY_SURFACE`.

`airtable_sync_jobs` was filtered so a queue row whose `source_table` pointed at an excluded RAG relation could not cross the boundary. The final filtered snapshot contained 138 rows.

## Secret boundary preserved

`vault.decrypted_secrets` remained prohibited and was never read for this extraction.

No API keys, bearer tokens, database passwords, private keys, R2 S3 secrets, Cloudflare API-token values, Supabase service-role values, Twilio credentials, ElevenLabs credentials, Telegram credentials, or raw authorization headers were intentionally written to the archive, Git templates, manifests, or reports.

Every generated relation payload was secret-scanned before archive write, and every relation manifest records `secret_scan_passed: true`.

## Integrity validation

For every approved relation, the archive process performed:

1. Exact relation allowlist enforcement.
2. Exact approved-column contract enforcement.
3. Snapshot row-count and primary-key fingerprint validation.
4. Secret scanning before archive write.
5. Canonical `JSONL.gz` generation.
6. Immutable-key collision protection.
7. R2 object write.
8. R2 read-back byte-count and SHA-256 verification.
9. Redaction-report write/read-back verification.
10. Manifest write last, followed by read-back verification.

A separate GitHub Actions finalizer subsequently re-downloaded all 26 manifests plus every object referenced by them, recomputed object sizes and SHA-256 values, decompressed every JSONL archive, verified row counts, recomputed every manifest's internal SHA-256, checked the RAG/secret denylist declarations, and checked archive-only runtime policy. All checks passed.

Aggregate proof from the completed run:

- HTTP archive responses: **26**.
- Verified successful responses: **26**.
- Distinct relations: **26**.
- Distinct run IDs: **1**.
- Archived rows: **458**.

## Transport and connection resolution

The archive was completed without recovering the unknown Supabase database password and without copying Cloudflare R2 S3 credential values out of the secret store.

Existing connections were reused:

- GitHub already had a working Cloudflare deployment credential.
- The four existing private R2 buckets were live and already usable through Cloudflare R2 bindings.
- Supabase `pg_net` supplied the approved source payloads directly from the database to a one-time isolated maintenance Worker.

The maintenance Worker was not a Caroline phone/runtime Worker. It was restricted to this archive run, the exact approved relations/snapshot contracts, existing private R2 buckets, and the Cloudflare-observed Supabase egress address.

Six initial test submissions were rejected with `SOURCE_IP_FORBIDDEN` before any R2 object creation because the first egress probe returned an IPv4 address while Cloudflare observed Supabase `pg_net` over IPv6. The ingress was repinned to Cloudflare's observed address and the six relations were retried successfully. No partial archive objects were created by the rejected attempts.

After central validation completed, the temporary Worker was deleted. Cloudflare's Worker list confirmed it absent, and its former health URL independently returned HTTP 404.

## Test and validation status

Exporter unit/safety suite completed before the final transport run: **22 passed, 1 skipped**. The skipped case was optional Parquet parity because `pyarrow` was not installed in that execution environment; JSONL is the canonical archive format.

The actual completed R2 run then passed the stronger post-write validation described above for all 26 relations and all referenced archive objects.

## External-write accounting

- Git branch/document/tooling writes: **yes** — dedicated archive branch only.
- R2 writes: **yes** — approved immutable archive/reference objects and central validation evidence only.
- Supabase Caroline/public-schema data writes: **no**.
- Supabase schema/DDL changes: **no**.
- Supabase internal transient `pg_net` queue activity: **yes**, solely to send archive HTTP requests; no Caroline source relation was modified.
- RAG row/content export: **no**.
- RAG changes: **no**.
- Phone/runtime behavior changes: **no**.
- Existing Caroline Worker changes: **no**.
- Temporary maintenance Worker deployment: **yes**, one-time transport only; **deleted after validation**.
- R2 bucket creation/rename/reconfiguration: **no**.
- R2 lifecycle/bucket-lock changes: **no**.
- Credential rotation: **no**.
- Supabase cleanup/deletion/truncation: **no**.

## Restore status

A Dockerized isolated restore-test plan exists in the repository. A restore into a temporary database was **not executed** in this archive run. No production restore or archive-to-runtime import is authorized.

## Remaining owner approvals

No further approval is required for this completed archive run.

Any future action to delete/truncate Supabase data, disable legacy schedulers/functions, rotate credentials, change phone behavior, migrate runtime state to Neon, deploy new production Workers, or import archive data into a live system remains a separate operation requiring explicit approval.

The frozen R2 archive is historical/reference material only. It is not a runtime database and it is not a replacement for any future Layer 2 RAG.
