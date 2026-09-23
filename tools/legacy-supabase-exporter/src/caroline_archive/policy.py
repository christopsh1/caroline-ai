from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .errors import (
    ProhibitedSecretSourceError, RagExcludedError, RelationNotAllowlistedError, RelationNotExportableError,
)

PROJECT_REF = 'drsyygxqwxuyoyjbsaqs'

RAG_EXCLUDED_RELATIONS = frozenset(['agent_memory', 'call_transcript_chunks', 'contact_profile_items', 'corpus_health_log', 'document_chunks', 'documents', 'interaction_chunks', 'memory_items', 'system_docs'])
PROHIBITED_SECRET_RELATIONS = frozenset(['vault.decrypted_secrets'])
DERIVED_VIEWS = frozenset(['agent_performance', 'contact_cards'])
FILTER_RAG_REFERENCES = frozenset(['airtable_sync_jobs'])

Disposition = Literal["EXPORT_R2_REFERENCE", "EXPORT_R2_HISTORICAL_EVENTS", "EXPORT_R2_TRANSCRIPTS", "EXPORT_R2_ARTIFACTS", "TEMPLATE_EXTRACTION_ONLY", "RETAIN_FOR_REVIEW", "RETIRE_AFTER_ARCHIVE", "SENSITIVE_EXCLUDE_OR_REDACT", "DERIVED_VIEW_RECOMPUTE", "RAG_EXCLUDED_LEGACY_SURFACE", "PROHIBITED_NEVER_EXPORT"]
Sensitivity = Literal["internal", "confidential", "restricted"]

@dataclass(frozen=True)
class RelationPolicy:
    disposition: Disposition
    sensitivity: Sensitivity
    bucket: str | None
    category: str | None
    export_format: str
    raw_export_allowed: bool
    pii: str = "unknown"
    communications: str = "unknown"
    prompt_ip: str = "unknown"
    provider_refs: str = "unknown"
    secret_ref_risk: str = "unknown"
    template: str | None = None
    legacy_coupling: str = "Legacy Supabase implementation details must not become new runtime requirements."
    rationale: str = "Reference/archive material only; never automatic new runtime state."

# Compact policy tuples: disposition, sensitivity, bucket, category, format, raw, pii, comms, prompt_ip, provider_refs, secret_ref_risk, template
_ROWS = {
    'agent_blueprints': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'agent blueprint / factory pattern'),
    'agent_connections': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'agent-to-connection assignment pattern'),
    'agent_creator_runs': ('EXPORT_R2_HISTORICAL_EVENTS', 'confidential', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'unknown', 'no', 'yes', 'yes', 'yes', 'agent creation audit model'),
    'agent_creators': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'agent creator/factory pattern'),
    'agent_improvements': ('EXPORT_R2_HISTORICAL_EVENTS', 'confidential', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'unknown', 'no', 'yes', 'yes', 'yes', 'evaluation/improvement audit model'),
    'agent_instances': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'agent instance binding pattern'),
    'agent_runs': ('EXPORT_R2_HISTORICAL_EVENTS', 'restricted', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'unknown', 'unknown', 'yes', 'yes', 'yes', 'agent-run audit model'),
    'agent_tool_registry': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'tool contract metadata'),
    'agents': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'agent identity/runtime profile model'),
    'airtable_sync_jobs': ('EXPORT_R2_HISTORICAL_EVENTS', 'internal', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'no', 'no', 'no', 'yes', 'no', 'retry/queue audit pattern'),
    'availability_state': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'no', 'no', 'availability policy/state pattern'),
    'bot_surfaces': ('SENSITIVE_EXCLUDE_OR_REDACT', 'restricted', 'caroline-artifacts', 'config-snapshots', 'sanitized contract', False, 'unknown', 'no', 'yes', 'yes', 'yes', 'surface/connector declaration pattern'),
    'brain_turn_cache': ('RETAIN_FOR_REVIEW', 'restricted', None, None, 'none', False, 'yes', 'yes', 'yes', 'yes', 'yes', None),
    'brain_turn_metrics': ('EXPORT_R2_HISTORICAL_EVENTS', 'restricted', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'yes', 'no', 'no', 'yes', 'no', 'latency/fallback telemetry model'),
    'calendar_events': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'no', 'no', 'calendar event model'),
    'calendar_shares': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'no', 'no', 'privacy-aware calendar sharing pattern'),
    'call_answering_restrictions': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'yes', 'no', 'caller restriction / reentry policy'),
    'call_history': ('EXPORT_R2_TRANSCRIPTS', 'restricted', 'caroline-transcripts', 'communications', 'JSONL.gz + optional Parquet', True, 'yes', 'yes', 'no', 'yes', 'no', 'authoritative call ledger'),
    'call_turns': ('EXPORT_R2_TRANSCRIPTS', 'restricted', 'caroline-transcripts', 'communications', 'JSONL.gz + optional Parquet', True, 'yes', 'yes', 'no', 'yes', 'no', 'normalized turn ledger'),
    'caroline_integration_config': ('SENSITIVE_EXCLUDE_OR_REDACT', 'restricted', 'caroline-artifacts', 'config-snapshots', 'sanitized contract', False, 'yes', 'no', 'yes', 'yes', 'yes', 'configuration separation: policy vs endpoint vs secret reference vs resource id'),
    'commitments': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'no', 'no', 'commitment lifecycle pattern'),
    'contact_card_details': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'yes', 'no', 'privacy-aware contact-card projection'),
    'contact_card_field_provenance': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'no', 'no', 'field-level provenance pattern'),
    'contact_identifiers': ('SENSITIVE_EXCLUDE_OR_REDACT', 'restricted', 'caroline-artifacts', 'reference', 'owner-approved restricted export or sanitized contract', False, 'yes', 'no', 'no', 'yes', 'no', 'stable identity resolution pattern'),
    'contact_mentions': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'yes', 'no', 'yes', 'no', 'mention resolution / owner approval pattern'),
    'contact_permissions': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'no', 'no', 'permission gating pattern'),
    'contacts': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'yes', 'no', 'canonical contact identity model'),
    'creator_rules': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'builder rule/policy pattern'),
    'events_processed': ('EXPORT_R2_HISTORICAL_EVENTS', 'restricted', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'yes', 'yes', 'no', 'yes', 'no', 'event idempotency ledger'),
    'instructions': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'yes', 'yes', 'no', 'no', 'owner instruction model'),
    'mcp_connections': ('SENSITIVE_EXCLUDE_OR_REDACT', 'restricted', 'caroline-artifacts', 'config-snapshots', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'connector contract pattern'),
    'owner_identities': ('SENSITIVE_EXCLUDE_OR_REDACT', 'restricted', 'caroline-artifacts', 'reference', 'owner-approved restricted export or sanitized contract', False, 'yes', 'no', 'no', 'yes', 'yes', 'owner identity binding pattern'),
    'phone_admission_events': ('EXPORT_R2_HISTORICAL_EVENTS', 'restricted', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'yes', 'no', 'no', 'yes', 'no', 'phone admission/restriction event model'),
    'platform_defaults': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'yes', 'platform default/policy pattern'),
    'project_contacts': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'no', 'no', 'project-contact mapping'),
    'projects': ('EXPORT_R2_ARTIFACTS', 'confidential', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'unknown', 'no', 'yes', 'no', 'no', 'project state model'),
    'relationships': ('EXPORT_R2_ARTIFACTS', 'restricted', 'caroline-artifacts', 'reference', 'JSONL.gz + manifest', True, 'yes', 'no', 'no', 'no', 'no', 'explicit confirmed relationship graph'),
    'scheduled_actions': ('EXPORT_R2_HISTORICAL_EVENTS', 'restricted', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'yes', 'yes', 'yes', 'yes', 'no', 'reservation/claim/idempotent scheduling pattern'),
    'sms_history': ('EXPORT_R2_TRANSCRIPTS', 'restricted', 'caroline-transcripts', 'communications', 'JSONL.gz + optional Parquet', True, 'yes', 'yes', 'no', 'yes', 'no', 'authoritative SMS ledger'),
    'system_capabilities': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'no', 'capability registry pattern'),
    'system_component_capabilities': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'no', 'component-to-capability mapping'),
    'system_components': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'no', 'system component registry'),
    'system_doc_revisions': ('RETAIN_FOR_REVIEW', 'confidential', None, None, 'none', False, 'unknown', 'no', 'yes', 'yes', 'yes', 'documentation revision/audit pattern'),
    'system_routes': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'system-contracts', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'no', 'route/contract mapping'),
    'test_documentation': ('TEMPLATE_EXTRACTION_ONLY', 'confidential', 'caroline-artifacts', 'tests', 'sanitized contract', False, 'no', 'no', 'yes', 'yes', 'no', 'test documentation modernization'),
    'transcript_ingestion_jobs': ('EXPORT_R2_HISTORICAL_EVENTS', 'restricted', 'caroline-events-raw', 'events', 'JSONL.gz + optional Parquet', True, 'yes', 'no', 'no', 'yes', 'no', 'async projection retry/idempotency pattern'),
}

POLICIES = {name: RelationPolicy(*row) for name, row in _ROWS.items()}
IN_SCOPE_RELATIONS = frozenset(POLICIES)
RAW_EXPORT_ALLOWLIST = frozenset(name for name, p in POLICIES.items() if p.raw_export_allowed)
SANITIZED_TEMPLATE_ALLOWLIST = frozenset(name for name, p in POLICIES.items() if p.disposition in {"TEMPLATE_EXTRACTION_ONLY", "SENSITIVE_EXCLUDE_OR_REDACT"})

# Explicit raw-export column allowlists. Omitted columns are never selected.
APPROVED_COLUMNS = {
    'agent_creator_runs': ('id', 'creator_id', 'created_agent_id', 'instance_id', 'status', 'error', 'created_at'),
    'agent_improvements': ('id', 'agent_id', 'agent_run_id', 'eval_scope', 'eval_target_id', 'evaluator_connection', 'evaluator_model', 'score_before', 'score_after', 'status', 'applied_at', 'applied_by', 'rollback_reason', 'created_at', 'updated_at'),
    'agent_runs': ('id', 'agent_id', 'run_mode', 'triggered_by', 'status', 'error', 'error_code', 'tools_called', 'connections_used', 'improvement_triggered', 'eval_triggered', 'eval_score', 'eval_connection', 'started_at', 'completed_at', 'duration_ms', 'call_history_id', 'conversation_id', 'created_at'),
    'airtable_sync_jobs': ('source_table', 'source_id', 'status', 'last_enqueued_at', 'last_attempted_at', 'last_dispatched_at', 'attempts', 'last_error'),
    'availability_state': ('id', 'status', 'human_readable', 'available_from', 'available_until', 'timezone', 'updated_by', 'updated_at'),
    'brain_turn_metrics': ('id', 'conversation_key', 'query_hash', 'interaction_mode', 'caller_phone', 'model_requested', 'model_used', 'fallback_used', 'rewrite_used', 'rewrite_model', 'candidate_count', 'final_count', 'reranker_used', 'cache_hit', 'retrieval_ms', 'upstream_headers_ms', 'tool_count', 'status', 'error_class', 'created_at', 'embedding_ms', 'lexical_ms', 'vector_ms', 'rerank_ms', 'first_token_ms', 'total_proxy_ms', 'timed_out', 'degraded'),
    'calendar_events': ('id', 'owner_contact_id', 'title', 'description', 'start_at', 'end_at', 'timezone', 'status', 'location', 'visibility', 'source', 'created_by', 'created_at', 'updated_at'),
    'calendar_shares': ('id', 'subject_contact_id', 'viewer_contact_id', 'share_level', 'notes', 'created_by', 'created_at', 'updated_at'),
    'call_answering_restrictions': ('id', 'normalized_phone', 'contact_id', 'status', 'reason_code', 'reason_summary', 'imposed_at', 'imposed_by', 'trigger_conversation_id', 'trigger_call_history_id', 'cleared_at', 'cleared_by', 'clear_note', 'reentry_notice_pending', 'reentry_notice_consumed_at', 'created_at', 'updated_at'),
    'call_history': ('id', 'conversation_id', 'normalized_phone', 'contact_id', 'caller_name', 'caller_organization', 'caller_relationship', 'request_summary', 'request_urgency', 'call_outcome', 'callback_number', 'detected_tone_profile', 'relationship_context_and_notes', 'started_at', 'ended_at', 'created_at', 'telephony_provider', 'direction', 'provider_call_id', 'agent_phone_number_id', 'call_duration_secs', 'termination_reason', 'call_successful', 'transcript', 'channel', 'caller_role', 'model_id', 'llm_provider'),
    'call_turns': ('id', 'call_history_id', 'sequence_number', 'speaker', 'content', 'tool_name', 'tool_result_ref', 'created_at', 'time_in_call_secs'),
    'commitments': ('id', 'contact_id', 'project_id', 'call_history_id', 'calendar_event_id', 'description', 'due_at', 'status', 'owner_side', 'source', 'resolved_at', 'resolution_note', 'created_at', 'updated_at'),
    'contact_card_details': ('contact_id', 'behavior_notes', 'key_dates', 'access_status', 'source_call_history_id', 'source_conversation_id', 'last_reviewed_at', 'last_reviewed_by', 'assigned_persona_tag', 'access_reason', 'access_changed_at', 'access_changed_by', 'privacy_tier', 'created_at', 'updated_at'),
    'contact_card_field_provenance': ('id', 'contact_id', 'field_name', 'field_key', 'value_snapshot', 'source_kind', 'source_memory_item_id', 'source_call_history_id', 'source_conversation_id', 'reviewed_at', 'reviewed_by', 'created_at'),
    'contact_mentions': ('id', 'source_call_history_id', 'source_conversation_id', 'source_contact_id', 'mentioned_name', 'normalized_name', 'resolved_contact_id', 'status', 'resolution_note', 'first_notified_at', 'last_notified_at', 'reminder_count', 'next_reminder_at', 'created_at', 'updated_at'),
    'contact_permissions': ('id', 'contact_id', 'permission_key', 'allowed', 'notes', 'created_at', 'updated_at'),
    'contacts': ('id', 'normalized_phone', 'display_name', 'first_name', 'last_name', 'contact_type', 'verification_status', 'tone_profile', 'notes', 'created_at', 'updated_at', 'relationship_to_owner', 'primary_email', 'is_owner'),
    'events_processed': ('event_id', 'processed_at', 'conversation_id', 'call_history_id', 'event_type', 'details', 'telegram_notification_status', 'telegram_message_id', 'telegram_notified_at', 'telegram_notification_attempts', 'telegram_notification_error'),
    'instructions': ('id', 'scope_type', 'contact_id', 'instruction', 'durable', 'active_from', 'active_until', 'status', 'source', 'priority', 'created_at', 'updated_at'),
    'phone_admission_events': ('id', 'normalized_phone', 'contact_id', 'event_type', 'previous_status', 'new_status', 'reason', 'source_conversation_id', 'source_call_history_id', 'created_by', 'created_at'),
    'project_contacts': ('id', 'project_id', 'contact_id', 'role', 'notes', 'created_at'),
    'projects': ('id', 'name', 'description', 'status', 'created_by', 'created_at', 'updated_at'),
    'relationships': ('id', 'from_contact_id', 'to_contact_id', 'relationship_type', 'status', 'confirmed_at', 'confirmed_by', 'notes', 'created_at', 'updated_at'),
    'scheduled_actions': ('id', 'calendar_event_id', 'target_contact_id', 'project_id', 'action_type', 'execute_at', 'timezone', 'status', 'purpose', 'talking_points', 'questions_to_ask', 'facts_to_convey', 'desired_outcome', 'special_instructions', 'original_instruction', 'idempotency_key', 'attempt_count', 'reserved_at', 'started_at', 'completed_at', 'failed_at', 'last_error', 'conversation_id', 'call_history_id', 'created_by', 'created_at', 'updated_at'),
    'sms_history': ('id', 'normalized_phone', 'contact_id', 'direction', 'body', 'provider_message_id', 'status', 'sent_at', 'delivered_at', 'telegram_notification_status', 'telegram_message_id', 'telegram_notified_at', 'linked_call_history_id', 'created_at'),
    'transcript_ingestion_jobs': ('call_history_id', 'conversation_id', 'contact_id', 'status', 'attempt_count', 'next_attempt_at', 'last_attempted_at', 'completed_at', 'last_error', 'created_at', 'updated_at'),
}

def normalize_relation(relation: str) -> str:
    return relation.strip().lower().removeprefix("public.")

def assert_relation_safe(relation: str, *, operation: str = "export") -> str:
    raw = relation.strip().lower()
    normalized = normalize_relation(raw)
    if raw in PROHIBITED_SECRET_RELATIONS or normalized in PROHIBITED_SECRET_RELATIONS:
        raise ProhibitedSecretSourceError()
    if normalized in RAG_EXCLUDED_RELATIONS:
        raise RagExcludedError()
    if normalized in DERIVED_VIEWS:
        if operation == "row_export":
            raise RelationNotExportableError("DERIVED_VIEW_RECOMPUTE")
        return normalized
    if normalized not in IN_SCOPE_RELATIONS:
        raise RelationNotAllowlistedError()
    return normalized

def assert_raw_export_allowed(relation: str) -> str:
    normalized = assert_relation_safe(relation, operation="row_export")
    if normalized not in RAW_EXPORT_ALLOWLIST:
        raise RelationNotExportableError(POLICIES[normalized].disposition)
    if normalized not in APPROVED_COLUMNS:
        raise RelationNotExportableError("APPROVED_COLUMN_SET_REQUIRED")
    return normalized
