# Extraction readiness / completion status

Branch: `archive/legacy-supabase-r2-extractor`

Current state: **COMPLETE**.

The owner-approved legacy non-RAG Supabase extraction has been written to the existing private R2 buckets and independently validated.

## Completed run

- Run ID: `01M3A2HCA9BFSK5PB5MF26EFKE`
- Approved relations archived: **26 / 26**
- Archived snapshot rows: **458**
- Central run manifest: `caroline-artifacts/supabase/drsyygxqwxuyoyjbsaqs/manifests/01M3A2HCA9BFSK5PB5MF26EFKE/run-manifest.json`
- Central validation report: `caroline-artifacts/supabase/drsyygxqwxuyoyjbsaqs/validation/01M3A2HCA9BFSK5PB5MF26EFKE/run-validation.json`
- Independent re-download/hash/row-count validation: **passed**
- Temporary archive-ingest Worker: **deleted and independently confirmed unavailable**

## Boundaries preserved

- Nine legacy RAG relations: **not exported and unchanged**.
- `vault.decrypted_secrets`: **not queried/exported**.
- Supabase Caroline/public-schema mutations: **none**.
- Supabase schema/DDL changes: **none**.
- Phone/runtime behavior changes: **none**.
- Existing Caroline Worker changes: **none**.
- Supabase cleanup/deletion/truncation: **none**.
- R2 lifecycle/bucket-lock changes: **none**.

The only Supabase-side side effect outside read queries was transient internal `pg_net` queue activity used to send the approved archive payloads to the temporary R2-bound maintenance Worker.

## Communication records archived

- `call_history`: 53
- `call_turns`: 99
- `sms_history`: 0

They remain restricted historical/reference material only.

## Validation hashes

Run manifest SHA-256:
`3cc0dd98ec80eb51b76fd5fe421aa3a8a4945ebe601ac18861633e6a86ceb43c`

Run validation SHA-256:
`568ffc7f1561cecce7b9bd27e2753251c8ab2c7c1c88cf8e932d01d4a9ec71d3`

See `final-extraction-report.md` for the complete execution, routing, integrity, redaction, transport, and cleanup record.
