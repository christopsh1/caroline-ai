# Legacy Supabase archive approval

Date: 2026-09-23

Branch: `archive/legacy-supabase-r2-extractor`

Source project: `drsyygxqwxuyoyjbsaqs`

## Owner approval

The owner approved the complete current **26-relation raw-export allowlist** and the existing redaction policy for the legacy non-RAG Supabase extraction project.

The communication archive is approved, including `call_history`, `call_turns`, and `sms_history`. Communications remain classified `restricted` for access-control and retention purposes; that classification does not block archive export.

The approval does **not** relax the hard RAG or secret boundaries. Excluded RAG relations remain non-queryable by the exporter and `vault.decrypted_secrets` remains prohibited.

Relations marked `SENSITIVE_EXCLUDE_OR_REDACT` remain limited to their reviewed sanitized/restricted-safe treatment; approval does not authorize credential values, tokens, private keys, secret-store values, or live credential-bearing endpoint configuration to enter R2 or Git.

`brain_turn_cache` is not promoted to raw export because cached context may cross the excluded RAG boundary. `system_doc_revisions` is not promoted to raw content export because revision bodies may duplicate excluded `system_docs` material. Any future archival treatment must preserve the same exclusion boundary.

## Approved raw-export relation set and live source validation

Read-only validation on 2026-09-23 confirmed all 26 approved relations exist and have stable primary keys.

| Relation | Rows | Primary key |
|---|---:|---|
| `agent_creator_runs` | 4 | `id` |
| `agent_improvements` | 5 | `id` |
| `agent_runs` | 9 | `id` |
| `airtable_sync_jobs` | 137 | `source_table, source_id` |
| `availability_state` | 1 | `id` |
| `brain_turn_metrics` | 16 | `id` |
| `calendar_events` | 0 | `id` |
| `calendar_shares` | 0 | `id` |
| `call_answering_restrictions` | 0 | `id` |
| `call_history` | 52 | `id` |
| `call_turns` | 98 | `id` |
| `commitments` | 0 | `id` |
| `contact_card_details` | 1 | `contact_id` |
| `contact_card_field_provenance` | 0 | `id` |
| `contact_mentions` | 0 | `id` |
| `contact_permissions` | 6 | `id` |
| `contacts` | 5 | `id` |
| `events_processed` | 58 | `event_id` |
| `instructions` | 1 | `id` |
| `phone_admission_events` | 7 | `id` |
| `project_contacts` | 0 | `id` |
| `projects` | 0 | `id` |
| `relationships` | 0 | `id` |
| `scheduled_actions` | 1 | `id` |
| `sms_history` | 0 | `id` |
| `transcript_ingestion_jobs` | 52 | `call_history_id` |

Total rows across the approved raw-export set at validation time: **453**.

These counts are validation evidence only; archive manifests must record the actual counts observed inside each repeatable-read export transaction.

## Hard exclusions preserved

RAG exclusions:

- `documents`
- `document_chunks`
- `system_docs`
- `corpus_health_log`
- `interaction_chunks`
- `agent_memory`
- `memory_items`
- `contact_profile_items`
- `call_transcript_chunks`

Required failure code: `RAG_EXCLUDED_LEGACY_SURFACE`.

Prohibited secret source:

- `vault.decrypted_secrets`

Required failure code: `PROHIBITED_SECRET_SOURCE`.

## Archive-write gate

The relation/redaction approval gate is satisfied.

A real archive write still requires runtime-only credential bindings outside Git/chat:

- read-only `SUPABASE_DB_URL`
- `R2_ENDPOINT_URL`
- create-only/non-delete `R2_ACCESS_KEY_ID`
- create-only/non-delete `R2_SECRET_ACCESS_KEY`

The write must still be executed through the explicit `--confirm-archive-write` CLI mode. No credential value may be committed, logged, placed in a manifest, or copied into this approval document.
