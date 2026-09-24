# Retained legacy RAG exclusion policy

The legacy Supabase RAG surface is outside this extraction project and remains untouched.

Fail-closed relations:

- `documents`
- `document_chunks`
- `system_docs`
- `corpus_health_log`
- `interaction_chunks`
- `agent_memory`
- `memory_items`
- `contact_profile_items`
- `call_transcript_chunks`

Any request to inspect rows, export, archive, migrate, or template from one of these relations must fail **before a row query** with:

`RAG_EXCLUDED_LEGACY_SURFACE`

The exporter must not copy vector data, embeddings, document content, prompt content, retrieval output, index data, or RAG-derived records. It must not modify RAG functions, triggers, policies, indexes, configuration, or Edge Functions.

The frozen R2 archive is not a future RAG and must not be accessed as normal phone-runtime state.
