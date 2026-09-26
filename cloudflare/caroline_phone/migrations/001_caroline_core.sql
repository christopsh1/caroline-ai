BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  display_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  notes_safe text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers (tenant_id, status);

CREATE TABLE IF NOT EXISTS caller_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  identifier_type text NOT NULL CHECK (identifier_type IN ('phone', 'email', 'external_id')),
  normalized_value text NOT NULL,
  authority text NOT NULL DEFAULT 'observed' CHECK (authority IN ('observed', 'caller_stated', 'owner_confirmed', 'system_derived')),
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, identifier_type, normalized_value)
);
CREATE INDEX IF NOT EXISTS caller_identity_customer_idx ON caller_identity_links (tenant_id, customer_id);

CREATE TABLE IF NOT EXISTS contact_preferences (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  voice_allowed boolean NOT NULL DEFAULT true,
  sms_allowed boolean NOT NULL DEFAULT false,
  calendar_share_level text NOT NULL DEFAULT 'none' CHECK (calendar_share_level IN ('none', 'busy_only', 'title', 'details')),
  relationship_disclosure_allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id)
);

CREATE TABLE IF NOT EXISTS dnc_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  normalized_phone text NOT NULL,
  source text NOT NULL,
  reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (tenant_id, normalized_phone)
);
CREATE INDEX IF NOT EXISTS dnc_active_phone_idx ON dnc_records (tenant_id, normalized_phone) WHERE active;

CREATE TABLE IF NOT EXISTS call_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text NOT NULL UNIQUE,
  twilio_call_sid text NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  selected_agent_id text NOT NULL,
  external_phone text,
  customer_id uuid REFERENCES customers(id),
  identity_status text NOT NULL DEFAULT 'unknown' CHECK (identity_status IN ('unknown', 'candidate', 'verified', 'rejected')),
  access_tier text NOT NULL DEFAULT 'tier_0_unknown_unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_contexts_tenant_created_idx ON call_contexts (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_contexts_customer_idx ON call_contexts (tenant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text NOT NULL REFERENCES call_contexts(call_context_id),
  twilio_call_sid text NOT NULL,
  elevenlabs_conversation_id text UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  agent_id text,
  status text,
  answered_by text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  outcome text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, twilio_call_sid)
);
CREATE INDEX IF NOT EXISTS calls_context_idx ON calls (call_context_id);
CREATE INDEX IF NOT EXISTS calls_tenant_created_idx ON calls (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS call_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_id uuid REFERENCES calls(id),
  call_context_id text NOT NULL,
  event_type text NOT NULL,
  provider text,
  provider_event_id text,
  payload_safe jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS call_events_context_idx ON call_events (call_context_id, occurred_at);

CREATE TABLE IF NOT EXISTS verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text NOT NULL REFERENCES call_contexts(call_context_id),
  customer_id uuid REFERENCES customers(id),
  method text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'verified', 'failed', 'expired', 'revoked')),
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_active_idx ON verification_sessions (tenant_id, call_context_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS confirmation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text NOT NULL REFERENCES call_contexts(call_context_id),
  action_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  action_payload jsonb NOT NULL,
  token_hash text NOT NULL UNIQUE,
  summary_safe text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS confirmation_active_idx ON confirmation_tokens (tenant_id, call_context_id, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  response_safe jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS transfer_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  destination_key text NOT NULL,
  display_name text NOT NULL,
  e164_phone text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, destination_key)
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid REFERENCES customers(id),
  call_context_id text REFERENCES call_contexts(call_context_id),
  external_ref text,
  title_safe text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('requested', 'scheduled', 'confirmed', 'cancelled', 'completed', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS appointments_time_idx ON appointments (tenant_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS appointments_customer_idx ON appointments (tenant_id, customer_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'unavailable')),
  source_ref text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS availability_slots_lookup_idx ON availability_slots (tenant_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text REFERENCES call_contexts(call_context_id),
  customer_id uuid REFERENCES customers(id),
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'failed', 'cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_open_idx ON tasks (tenant_id, status, due_at);

CREATE TABLE IF NOT EXISTS callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text REFERENCES call_contexts(call_context_id),
  customer_id uuid REFERENCES customers(id),
  normalized_phone text NOT NULL,
  requested_for timestamptz,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'scheduled', 'executing', 'completed', 'failed', 'cancelled')),
  reason_safe text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS callbacks_status_idx ON callbacks (tenant_id, status, requested_for);

CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text NOT NULL REFERENCES call_contexts(call_context_id),
  destination_id uuid NOT NULL REFERENCES transfer_destinations(id),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'executing', 'connected', 'failed', 'cancelled')),
  twilio_call_sid text NOT NULL,
  provider_reference text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfers_context_idx ON transfers (tenant_id, call_context_id, created_at DESC);

CREATE TABLE IF NOT EXISTS call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_id uuid NOT NULL REFERENCES calls(id),
  elevenlabs_conversation_id text NOT NULL,
  transcript_json jsonb NOT NULL,
  transcript_text text,
  source text NOT NULL DEFAULT 'elevenlabs',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, elevenlabs_conversation_id)
);

CREATE TABLE IF NOT EXISTS call_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_id uuid NOT NULL REFERENCES calls(id),
  turn_index integer NOT NULL,
  speaker text NOT NULL CHECK (speaker IN ('agent', 'user', 'system', 'tool')),
  content text NOT NULL,
  occurred_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, turn_index)
);
CREATE INDEX IF NOT EXISTS call_turns_call_idx ON call_turns (call_id, turn_index);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_id uuid NOT NULL REFERENCES calls(id),
  summary text NOT NULL,
  source text NOT NULL DEFAULT 'elevenlabs',
  source_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, source)
);

CREATE TABLE IF NOT EXISTS embedding_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  collection_key text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  embedding_version text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0),
  input_type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, collection_key, provider, model, embedding_version, dimensions, input_type)
);

CREATE TABLE IF NOT EXISTS durable_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid REFERENCES customers(id),
  source_call_id uuid REFERENCES calls(id),
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'confirmed', 'superseded', 'expired', 'rejected')),
  authority text NOT NULL CHECK (authority IN ('observed', 'caller_stated', 'owner_confirmed', 'system_derived')),
  memory_type text NOT NULL,
  content text NOT NULL,
  confidence double precision,
  expires_at timestamptz,
  supersedes_memory_id uuid REFERENCES durable_memories(id),
  embedding_provider text,
  embedding_model text,
  embedding_version text,
  embedding_dimensions integer,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (embedding IS NULL OR embedding_dimensions = 1536)
);
CREATE INDEX IF NOT EXISTS durable_memories_customer_idx ON durable_memories (tenant_id, customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS durable_memories_embedding_hnsw ON durable_memories USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  document_key text NOT NULL,
  title text NOT NULL,
  source_uri text,
  content_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'disabled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_key, content_sha256)
);
CREATE INDEX IF NOT EXISTS knowledge_documents_active_idx ON knowledge_documents (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id),
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  embedding_provider text NOT NULL,
  embedding_model text NOT NULL,
  embedding_version text NOT NULL,
  embedding_dimensions integer NOT NULL DEFAULT 1536 CHECK (embedding_dimensions = 1536),
  embedding_input_type text NOT NULL DEFAULT 'search_document',
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index, embedding_provider, embedding_model, embedding_version)
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx ON knowledge_chunks (tenant_id, document_id, chunk_index);
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS rag_retrieval_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text REFERENCES call_contexts(call_context_id),
  query_sha256 text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  embedding_version text NOT NULL,
  dimensions integer NOT NULL,
  input_type text NOT NULL,
  top_k integer NOT NULL,
  result_chunk_ids uuid[] NOT NULL DEFAULT '{}',
  result_scores double precision[] NOT NULL DEFAULT '{}',
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rag_retrieval_context_idx ON rag_retrieval_audit (tenant_id, call_context_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tool_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  call_context_id text REFERENCES call_contexts(call_context_id),
  tool_name text NOT NULL,
  request_id text,
  idempotency_key text,
  authorization_result text NOT NULL,
  result_status text NOT NULL,
  latency_ms integer,
  details_safe jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_audit_context_idx ON tool_audit_events (tenant_id, call_context_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_call_event_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_id text NOT NULL,
  event_type text NOT NULL,
  conversation_id text,
  call_context_id text,
  status text NOT NULL CHECK (status IN ('received', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS post_call_receipts_status_idx ON post_call_event_receipts (tenant_id, status, received_at);

COMMIT;
