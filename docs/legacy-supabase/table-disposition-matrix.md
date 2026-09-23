# Legacy Supabase relation disposition matrix

Project: `drsyygxqwxuyoyjbsaqs`

Legend: `Y` yes, `N` no, `?` unknown. **Git raw = N for every row. Auto-runtime = N for every row.** This archive is reference-only; no row here may automatically become future runtime state. Prefixes shown are relative to `supabase/drsyygxqwxuyoyjbsaqs/`.

| Relation | Purpose | Sens. | PII | Comms | Prompt/IP | Provider/config | Secret-ref risk | Disposition | R2 target | Format | Git raw | Auto-runtime | Reusable concept | Redaction / owner decision |
|---|---|---|:---:|:---:|:---:|:---:|:---:|---|---|---|:---:|:---:|---|---|
| `agent_blueprints` | Reusable agent blueprint definitions | confidential | N | N | Y | Y | Y | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/agent_blueprints/export=<ULID>/ | sanitized contract | N | N | agent blueprint / factory pattern | Sanitized contract/template only; never raw row export. |
| `agent_connections` | Agent-to-connector assignments | confidential | N | N | Y | Y | Y | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/agent_connections/export=<ULID>/ | sanitized contract | N | N | agent-to-connection assignment pattern | Sanitized contract/template only; never raw row export. |
| `agent_creator_runs` | Agent-creation execution history | confidential | ? | N | Y | Y | Y | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/agent_creator_runs/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | agent creation audit model | Approved-column export only; secret-scan staged rows. |
| `agent_creators` | Agent factory definitions | confidential | N | N | Y | Y | Y | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/agent_creators/export=<ULID>/ | sanitized contract | N | N | agent creator/factory pattern | Sanitized contract/template only; never raw row export. |
| `agent_improvements` | Evaluation/improvement history | confidential | ? | N | Y | Y | Y | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/agent_improvements/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | evaluation/improvement audit model | Approved-column export only; secret-scan staged rows. |
| `agent_instances` | Instantiated agent bindings | confidential | N | N | Y | Y | Y | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/agent_instances/export=<ULID>/ | sanitized contract | N | N | agent instance binding pattern | Sanitized contract/template only; never raw row export. |
| `agent_runs` | Agent execution/audit history | restricted | ? | ? | Y | Y | Y | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/agent_runs/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | agent-run audit model | Approved-column export only; secret-scan staged rows. |
| `agent_tool_registry` | Tool contract registry | confidential | N | N | Y | Y | Y | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/agent_tool_registry/export=<ULID>/ | sanitized contract | N | N | tool contract metadata | Sanitized contract/template only; never raw row export. |
| `agents` | Agent identity/runtime registry | confidential | N | N | Y | Y | Y | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/agents/export=<ULID>/ | sanitized contract | N | N | agent identity/runtime profile model | Sanitized contract/template only; never raw row export. |
| `airtable_sync_jobs` | Legacy Airtable sync queue | internal | N | N | N | Y | N | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/airtable_sync_jobs/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | retry/queue audit pattern | Filter any row whose source_table names a RAG-excluded relation. |
| `availability_state` | Owner availability state | restricted | Y | N | N | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/availability_state/export=<ULID>/ | JSONL.gz + manifest | N | N | availability policy/state pattern | Approved-column export only; secret-scan staged rows. |
| `bot_surfaces` | Connector/surface configuration | restricted | ? | N | Y | Y | Y | `SENSITIVE_EXCLUDE_OR_REDACT` | caroline-artifacts: config-snapshots/bot_surfaces/export=<ULID>/ | sanitized contract | N | N | surface/connector declaration pattern | Raw blocked; owner-approved sanitized transform or explicit restricted export decision. |
| `brain_turn_cache` | Ephemeral brain-turn cache | restricted | Y | Y | Y | Y | Y | `RETAIN_FOR_REVIEW` | — | none | N | N | — | Blocked pending owner review; possible excluded/contextual overlap. |
| `brain_turn_metrics` | Brain/runtime latency telemetry | restricted | Y | N | N | Y | N | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/brain_turn_metrics/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | latency/fallback telemetry model | Approved-column export only; secret-scan staged rows. |
| `calendar_events` | Legacy calendar records | restricted | Y | N | N | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/calendar_events/export=<ULID>/ | JSONL.gz + manifest | N | N | calendar event model | Approved-column export only; secret-scan staged rows. |
| `calendar_shares` | Calendar disclosure grants | restricted | Y | N | N | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/calendar_shares/export=<ULID>/ | JSONL.gz + manifest | N | N | privacy-aware calendar sharing pattern | Approved-column export only; secret-scan staged rows. |
| `call_answering_restrictions` | Caller restriction/reentry state | restricted | Y | N | N | Y | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/call_answering_restrictions/export=<ULID>/ | JSONL.gz + manifest | N | N | caller restriction / reentry policy | Approved-column export only; secret-scan staged rows. |
| `call_history` | Authoritative call ledger/transcript | restricted | Y | Y | N | Y | N | `EXPORT_R2_TRANSCRIPTS` | caroline-transcripts: communications/call_history/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | authoritative call ledger | Approved-column export only; secret-scan staged rows. |
| `call_turns` | Normalized call-turn ledger | restricted | Y | Y | N | Y | N | `EXPORT_R2_TRANSCRIPTS` | caroline-transcripts: communications/call_turns/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | normalized turn ledger | Approved-column export only; secret-scan staged rows. |
| `caroline_integration_config` | Mixed runtime/config registry | restricted | Y | N | Y | Y | Y | `SENSITIVE_EXCLUDE_OR_REDACT` | caroline-artifacts: config-snapshots/caroline_integration_config/export=<ULID>/ | sanitized contract | N | N | configuration separation: policy vs endpoint vs secret reference vs resource id | Raw blocked; owner-approved sanitized transform or explicit restricted export decision. |
| `commitments` | Contact/project commitments | restricted | Y | N | N | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/commitments/export=<ULID>/ | JSONL.gz + manifest | N | N | commitment lifecycle pattern | Approved-column export only; secret-scan staged rows. |
| `contact_card_details` | Contact-card/private context details | restricted | Y | N | N | Y | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/contact_card_details/export=<ULID>/ | JSONL.gz + manifest | N | N | privacy-aware contact-card projection | Approved-column export only; secret-scan staged rows. |
| `contact_card_field_provenance` | Field-level provenance | restricted | Y | N | N | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/contact_card_field_provenance/export=<ULID>/ | JSONL.gz + manifest | N | N | field-level provenance pattern | Approved-column export only; secret-scan staged rows. |
| `contact_identifiers` | External identity identifiers | restricted | Y | N | N | Y | N | `SENSITIVE_EXCLUDE_OR_REDACT` | caroline-artifacts: reference/contact_identifiers/export=<ULID>/ | owner-approved restricted export or sanitized contract | N | N | stable identity resolution pattern | Raw blocked; owner-approved sanitized transform or explicit restricted export decision. |
| `contact_mentions` | Mention-resolution workflow state | restricted | Y | Y | N | Y | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/contact_mentions/export=<ULID>/ | JSONL.gz + manifest | N | N | mention resolution / owner approval pattern | Approved-column export only; secret-scan staged rows. |
| `contact_permissions` | Per-contact authorization rules | restricted | Y | N | N | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/contact_permissions/export=<ULID>/ | JSONL.gz + manifest | N | N | permission gating pattern | Approved-column export only; secret-scan staged rows. |
| `contacts` | Canonical legacy contacts | restricted | Y | N | N | Y | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/contacts/export=<ULID>/ | JSONL.gz + manifest | N | N | canonical contact identity model | Approved-column export only; secret-scan staged rows. |
| `creator_rules` | Agent-builder rules | confidential | N | N | Y | Y | Y | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/creator_rules/export=<ULID>/ | sanitized contract | N | N | builder rule/policy pattern | Sanitized contract/template only; never raw row export. |
| `events_processed` | Idempotent event ledger | restricted | Y | Y | N | Y | N | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/events_processed/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | event idempotency ledger | Approved-column export only; secret-scan staged rows. |
| `instructions` | Owner/system instructions | restricted | Y | Y | Y | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/instructions/export=<ULID>/ | JSONL.gz + manifest | N | N | owner instruction model | Approved-column export only; secret-scan staged rows. |
| `mcp_connections` | MCP/connector connection metadata | restricted | N | N | Y | Y | Y | `SENSITIVE_EXCLUDE_OR_REDACT` | caroline-artifacts: config-snapshots/mcp_connections/export=<ULID>/ | sanitized contract | N | N | connector contract pattern | Raw blocked; owner-approved sanitized transform or explicit restricted export decision. |
| `owner_identities` | Owner channel identity bindings | restricted | Y | N | N | Y | Y | `SENSITIVE_EXCLUDE_OR_REDACT` | caroline-artifacts: reference/owner_identities/export=<ULID>/ | owner-approved restricted export or sanitized contract | N | N | owner identity binding pattern | Raw blocked; owner-approved sanitized transform or explicit restricted export decision. |
| `phone_admission_events` | Phone admission/restriction timeline | restricted | Y | N | N | Y | N | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/phone_admission_events/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | phone admission/restriction event model | Approved-column export only; secret-scan staged rows. |
| `platform_defaults` | Platform default policy/config | confidential | N | N | Y | Y | Y | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/platform_defaults/export=<ULID>/ | sanitized contract | N | N | platform default/policy pattern | Sanitized contract/template only; never raw row export. |
| `project_contacts` | Project/contact associations | restricted | Y | N | N | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/project_contacts/export=<ULID>/ | JSONL.gz + manifest | N | N | project-contact mapping | Approved-column export only; secret-scan staged rows. |
| `projects` | Legacy project records | confidential | ? | N | Y | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/projects/export=<ULID>/ | JSONL.gz + manifest | N | N | project state model | Approved-column export only; secret-scan staged rows. |
| `relationships` | Confirmed contact relationship graph | restricted | Y | N | N | N | N | `EXPORT_R2_ARTIFACTS` | caroline-artifacts: reference/relationships/export=<ULID>/ | JSONL.gz + manifest | N | N | explicit confirmed relationship graph | Approved-column export only; secret-scan staged rows. |
| `scheduled_actions` | Scheduled action lifecycle/audit | restricted | Y | Y | Y | Y | N | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/scheduled_actions/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | reservation/claim/idempotent scheduling pattern | Approved-column export only; secret-scan staged rows. |
| `sms_history` | Authoritative SMS ledger | restricted | Y | Y | N | Y | N | `EXPORT_R2_TRANSCRIPTS` | caroline-transcripts: communications/sms_history/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | authoritative SMS ledger | Approved-column export only; secret-scan staged rows. |
| `system_capabilities` | Capability catalog | confidential | N | N | Y | Y | N | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/system_capabilities/export=<ULID>/ | sanitized contract | N | N | capability registry pattern | Sanitized contract/template only; never raw row export. |
| `system_component_capabilities` | Component-capability assignments | confidential | N | N | Y | Y | N | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/system_component_capabilities/export=<ULID>/ | sanitized contract | N | N | component-to-capability mapping | Sanitized contract/template only; never raw row export. |
| `system_components` | System component registry | confidential | N | N | Y | Y | N | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/system_components/export=<ULID>/ | sanitized contract | N | N | system component registry | Sanitized contract/template only; never raw row export. |
| `system_doc_revisions` | System-document revision bodies/history | confidential | ? | N | Y | Y | Y | `RETAIN_FOR_REVIEW` | — | none | N | N | documentation revision/audit pattern | Blocked pending owner review; possible excluded/contextual overlap. |
| `system_routes` | System route/contract mapping | confidential | N | N | Y | Y | N | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: system-contracts/system_routes/export=<ULID>/ | sanitized contract | N | N | route/contract mapping | Sanitized contract/template only; never raw row export. |
| `test_documentation` | Legacy test registry/documentation | confidential | N | N | Y | Y | N | `TEMPLATE_EXTRACTION_ONLY` | caroline-artifacts: tests/test_documentation/export=<ULID>/ | sanitized contract | N | N | test documentation modernization | Sanitized contract/template only; never raw row export. |
| `transcript_ingestion_jobs` | Transcript-processing retry/status queue | restricted | Y | N | N | Y | N | `EXPORT_R2_HISTORICAL_EVENTS` | caroline-events-raw: events/transcript_ingestion_jobs/export=<ULID>/ | JSONL.gz + optional Parquet | N | N | async projection retry/idempotency pattern | Approved-column export only; secret-scan staged rows. |

## Derived views

| Relation | Disposition | Handling | Git raw | Auto-runtime |
|---|---|---|:---:|:---:|
| `agent_performance` | `DERIVED_VIEW_RECOMPUTE` | Recompute from canonical inputs; preserve only sanitized projection/metric contract if later approved. | N | N |
| `contact_cards` | `DERIVED_VIEW_RECOMPUTE` | Recompute from canonical inputs; preserve only sanitized projection contract if later approved. | N | N |

## Hard RAG exclusions

- `agent_memory` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.
- `call_transcript_chunks` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.
- `contact_profile_items` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.
- `corpus_health_log` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.
- `document_chunks` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.
- `documents` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.
- `interaction_chunks` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.
- `memory_items` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.
- `system_docs` → `RAG_EXCLUDED_LEGACY_SURFACE`; fail before row query.

## Prohibited secret sources

- `vault.decrypted_secrets` → `PROHIBITED_SECRET_SOURCE`; never query for this project.

## Explicit raw-export allowlist

- `agent_creator_runs`
- `agent_improvements`
- `agent_runs`
- `airtable_sync_jobs`
- `availability_state`
- `brain_turn_metrics`
- `calendar_events`
- `calendar_shares`
- `call_answering_restrictions`
- `call_history`
- `call_turns`
- `commitments`
- `contact_card_details`
- `contact_card_field_provenance`
- `contact_mentions`
- `contact_permissions`
- `contacts`
- `events_processed`
- `instructions`
- `phone_admission_events`
- `project_contacts`
- `projects`
- `relationships`
- `scheduled_actions`
- `sms_history`
- `transcript_ingestion_jobs`

Every raw-export relation uses the exact column allowlist in `tools/legacy-supabase-exporter/src/caroline_archive/policy.py`. Omitted columns are never selected. All other in-scope relations remain blocked from raw row export until a separately reviewed sanitized transformation or owner decision is supplied.
