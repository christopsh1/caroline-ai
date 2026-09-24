# Completed archive execution record

The owner-approved 26-relation legacy Supabase archive run has completed successfully.

Completed run ID:

`01M3A2HCA9BFSK5PB5MF26EFKE`

Do **not** rerun or reuse that immutable run ID. Its R2 keys are intentionally collision-protected.

Permanent exporter tooling remains under `tools/legacy-supabase-exporter/` for audit/reference or a separately approved future archive run. A future run must generate a new ULID and must continue to enforce the same RAG and secret-source exclusions.

The completed run archived 458 rows across 26 approved relations and passed independent R2 re-download/hash/row-count validation.

Central evidence:

- `caroline-artifacts/supabase/drsyygxqwxuyoyjbsaqs/manifests/01M3A2HCA9BFSK5PB5MF26EFKE/run-manifest.json`
- `caroline-artifacts/supabase/drsyygxqwxuyoyjbsaqs/validation/01M3A2HCA9BFSK5PB5MF26EFKE/run-validation.json`

No secret value belongs in Git, chat, manifests, logs, or reports.
