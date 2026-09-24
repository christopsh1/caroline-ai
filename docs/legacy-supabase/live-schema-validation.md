# Live source schema validation

Date: 2026-09-24

Source project: `drsyygxqwxuyoyjbsaqs`

Validation type: read-only metadata inspection only.

## Result

All 26 owner-approved raw-export relations currently exist in the live `public` schema, all have stable primary keys, and every exporter-approved selected column exists in the live schema.

No row values were required for this schema-drift check.

The exporter intentionally omits non-approved columns even when they exist in the legacy source. Examples include broad `metadata`/`context` fields and RAG-specific timing/candidate/vector fields in `brain_turn_metrics`.

## Current project metadata

- Project: Caroline
- Project ref: `drsyygxqwxuyoyjbsaqs`
- Region: `us-east-1`
- Status at validation: `ACTIVE_HEALTHY`
- Postgres major version: 17

## Connection guidance

For Codespaces or another IPv4-oriented client, use the exact current **Session pooler** connection string copied from the Supabase **Connect** panel and store the completed value as `SUPABASE_DB_URL` in the runtime secret store.

Do not commit the database password or completed connection URL.

## Boundary confirmation

This validation did not inspect or export any excluded RAG relation and did not query `vault.decrypted_secrets`.

RAG denylist and secret-source prohibition remain unchanged.
