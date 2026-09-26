BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- Persona and contact identity layer
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS persona_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  persona_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  relationship_minimum text NOT NULL,
  verification_required boolean NOT NULL DEFAULT true,
  allowed_for_inbound boolean NOT NULL DEFAULT true,
  allowed_for_outbound boolean NOT NULL DEFAULT false,
  professional_register smallint NOT NULL CHECK (professional_register BETWEEN 0 AND 10),
  casualness smallint NOT NULL CHECK (casualness BETWEEN 0 AND 10),
  expressiveness smallint NOT NULL CHECK (expressiveness BETWEEN 0 AND 10),
  humor_level smallint NOT NULL CHECK (humor_level BETWEEN 0 AND 10),
  directness_level smallint NOT NULL CHECK (directness_level BETWEEN 0 AND 10),
  warmth_level smallint NOT NULL CHECK (warmth_level BETWEEN 0 AND 10),
  profanity_policy text NOT NULL,
  teasing_policy text NOT NULL,
  tone_matching_policy text NOT NULL,
  emotional_adaptation_policy text NOT NULL,
  prompt_overlay text NOT NULL,
  escalation_overlay text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  relationship_type text,
  relationship_tier text,
  allow_state text NOT NULL DEFAULT 'allow' CHECK (allow_state IN ('allow','restrict','block')),
  consent_state text NOT NULL DEFAULT 'unknown' CHECK (consent_state IN ('unknown','granted','denied','revoked','not_required')),
  first_seen_at timestamptz,
  last_interaction_at timestamptz,
  owner_notes text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_numbers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number text NOT NULL UNIQUE,
  normalized_e164 text NOT NULL UNIQUE,
  label text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  owner_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  owner_context_mode text NOT NULL DEFAULT 'direct_owner',
  persona_key text NOT NULL DEFAULT 'unhinged_friend' REFERENCES persona_profiles(persona_key),
  receptionist_mode_disabled boolean NOT NULL DEFAULT true,
  behavior_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_phone_numbers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  normalized_e164 text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, normalized_e164),
  UNIQUE (normalized_e164)
);

CREATE TABLE IF NOT EXISTS contact_card_details (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  company text,
  role text,
  how_they_know_chris text,
  learned_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy_tier integer NOT NULL DEFAULT 0 CHECK (privacy_tier BETWEEN 0 AND 10),
  access_status text NOT NULL DEFAULT 'active',
  assigned_persona_tag text,
  behavior_notes text,
  key_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_reviewed_at timestamptz,
  last_reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_persona_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  persona_profile_id uuid NOT NULL REFERENCES persona_profiles(id) ON DELETE RESTRICT,
  owner_approved boolean NOT NULL DEFAULT false,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  assignment_reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > effective_at)
);

CREATE TABLE IF NOT EXISTS contact_permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  allowed boolean NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  granted_by text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, permission_key)
);

CREATE TABLE IF NOT EXISTS contact_instructions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  instruction text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  durable boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'owner',
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > effective_at)
);

-- -----------------------------------------------------------------------------
-- Call ledger; defined before provenance/memory tables that reference calls.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS call_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_context_id text NOT NULL UNIQUE,
  twilio_call_sid text UNIQUE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  disposition text,
  persona_used text REFERENCES persona_profiles(persona_key),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  admission_decision text,
  verification_state text,
  telephony_provider text NOT NULL DEFAULT 'twilio',
  voice_provider text NOT NULL DEFAULT 'elevenlabs',
  provider_conversation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS contact_card_field_provenance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_value jsonb,
  source_type text NOT NULL CHECK (source_type IN ('caroline_inferred','owner_stated','call_derived','imported','system_derived')),
  source_call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  source_note text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  observed_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_memories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  memory_text text NOT NULL,
  memory_type text NOT NULL DEFAULT 'relationship_context',
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('candidate','approved','superseded','expired','rejected')),
  authority text NOT NULL DEFAULT 'call_derived' CHECK (authority IN ('caroline_inferred','owner_stated','call_derived','system_derived')),
  source_call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  owner_approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by text,
  expires_at timestamptz,
  deduplication_key text,
  embedding vector(1536),
  embedding_space text NOT NULL DEFAULT 'openai:text-embedding-3-small:1536:v1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, deduplication_key)
);

CREATE TABLE IF NOT EXISTS contact_mentions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  mentioned_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  mentioned_name text,
  relationship_label text,
  call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  context_excerpt text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  owner_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mentioned_contact_id IS NOT NULL OR mentioned_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS call_turns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id uuid NOT NULL REFERENCES call_records(id) ON DELETE CASCADE,
  turn_index integer NOT NULL CHECK (turn_index >= 0),
  speaker text NOT NULL CHECK (speaker IN ('caller','caroline')),
  content text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, turn_index)
);

CREATE TABLE IF NOT EXISTS call_summaries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id uuid NOT NULL UNIQUE REFERENCES call_records(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  summary_text text NOT NULL,
  action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  mood_signal text,
  key_topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  summary_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phone_admission_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  normalized_phone text,
  decision text NOT NULL,
  previous_state text,
  new_state text,
  reason text,
  decided_by text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS availability_state (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  status text NOT NULL,
  current_activity text,
  loved_ones_detail text,
  business_vague text,
  available_from timestamptz,
  available_until timestamptz,
  timezone text NOT NULL DEFAULT 'America/New_York',
  updated_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_until IS NULL OR available_from IS NULL OR available_until >= available_from)
);

CREATE TABLE IF NOT EXISTS call_answering_restrictions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  relationship_tier text,
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::smallint[],
  start_time time,
  end_time time,
  timezone text NOT NULL DEFAULT 'America/New_York',
  action text NOT NULL CHECK (action IN ('allow','restrict','block','voicemail','transfer')),
  override_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commitments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('to_contact','from_contact','mutual')),
  commitment_text text NOT NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled','expired')),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_actions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  execute_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','reserved','executing','completed','failed','cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  reserved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- RAG and durable memory
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_key text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  source text,
  rag_feed boolean NOT NULL DEFAULT true,
  access_scope text NOT NULL DEFAULT 'approved',
  effective_from timestamptz,
  effective_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  embedding vector(1536),
  token_count integer CHECK (token_count IS NULL OR token_count >= 0),
  embedding_space text NOT NULL DEFAULT 'openai:text-embedding-3-small:1536:v1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  content text NOT NULL,
  memory_type text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('candidate','approved','superseded','expired','rejected')),
  authority text NOT NULL DEFAULT 'system_derived' CHECK (authority IN ('owner_stated','call_derived','system_derived')),
  source_call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  owner_approved boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  deduplication_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  content text NOT NULL,
  embedding vector(1536),
  embedding_space text NOT NULL DEFAULT 'openai:text-embedding-3-small:1536:v1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS retrieval_audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id uuid REFERENCES call_records(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  query_text text NOT NULL,
  retrieval_type text NOT NULL DEFAULT 'rag',
  chunks_returned jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding_space text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Agent registry, secret metadata, and idempotency
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  provider text NOT NULL,
  agent_id text NOT NULL UNIQUE,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','disabled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS secret_registry (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  secret_name text NOT NULL UNIQUE,
  purpose text NOT NULL,
  which_worker text NOT NULL,
  last_rotated timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  scope text NOT NULL DEFAULT 'post_call',
  processed_at timestamptz,
  expires_at timestamptz,
  payload_hash text,
  result_ref jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_contact_phone_numbers_phone_number
  ON contact_phone_numbers (phone_number);
CREATE INDEX IF NOT EXISTS idx_contact_phone_numbers_normalized_e164
  ON contact_phone_numbers (normalized_e164);
CREATE INDEX IF NOT EXISTS idx_call_records_contact_id
  ON call_records (contact_id);
CREATE INDEX IF NOT EXISTS idx_call_records_started_at
  ON call_records (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key
  ON idempotency_keys (key);
CREATE INDEX IF NOT EXISTS idx_contact_memories_contact_id
  ON contact_memories (contact_id);
CREATE INDEX IF NOT EXISTS idx_call_summaries_contact_id
  ON call_summaries (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_instructions_contact_id
  ON contact_instructions (contact_id, active, priority);
CREATE INDEX IF NOT EXISTS idx_contact_permissions_contact_id
  ON contact_permissions (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_mentions_source
  ON contact_mentions (source_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_mentions_mentioned
  ON contact_mentions (mentioned_contact_id);
CREATE INDEX IF NOT EXISTS idx_call_turns_call_id
  ON call_turns (call_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_due
  ON scheduled_actions (status, execute_at);
CREATE INDEX IF NOT EXISTS idx_commitments_contact_status
  ON commitments (contact_id, status);
CREATE INDEX IF NOT EXISTS idx_retrieval_audit_call
  ON retrieval_audit_log (call_id, retrieved_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_embedding
  ON memory_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_contact_memories_embedding
  ON contact_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- -----------------------------------------------------------------------------
-- Vector search functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE(id uuid, content text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT dc.id,
         dc.content,
         (1 - (dc.embedding <=> query_embedding))::float AS similarity
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.embedding IS NOT NULL
    AND d.rag_feed = true
    AND (d.effective_from IS NULL OR d.effective_from <= now())
    AND (d.effective_until IS NULL OR d.effective_until > now())
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 0);
$$;

CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_contact_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, content text, similarity float)
LANGUAGE sql STABLE AS $$
  WITH candidates AS (
    SELECT mc.id,
           mc.content,
           (1 - (mc.embedding <=> query_embedding))::float AS similarity
    FROM memory_chunks mc
    JOIN memories m ON m.id = mc.memory_id
    WHERE mc.embedding IS NOT NULL
      AND m.status = 'approved'
      AND (m.expires_at IS NULL OR m.expires_at > now())
      AND 1 - (mc.embedding <=> query_embedding) > match_threshold

    UNION ALL

    SELECT cm.id,
           cm.memory_text AS content,
           (1 - (cm.embedding <=> query_embedding))::float AS similarity
    FROM contact_memories cm
    WHERE p_contact_id IS NOT NULL
      AND cm.contact_id = p_contact_id
      AND cm.embedding IS NOT NULL
      AND cm.status = 'approved'
      AND (cm.expires_at IS NULL OR cm.expires_at > now())
      AND 1 - (cm.embedding <=> query_embedding) > match_threshold
  )
  SELECT c.id, c.content, c.similarity
  FROM candidates c
  ORDER BY c.similarity DESC
  LIMIT GREATEST(match_count, 0);
$$;

-- -----------------------------------------------------------------------------
-- Seed: six first-class personas
-- -----------------------------------------------------------------------------

INSERT INTO persona_profiles (
  persona_key, display_name, description, relationship_minimum,
  verification_required, allowed_for_inbound, allowed_for_outbound,
  professional_register, casualness, expressiveness, humor_level,
  directness_level, warmth_level, profanity_policy, teasing_policy,
  tone_matching_policy, emotional_adaptation_policy, prompt_overlay,
  escalation_overlay
) VALUES
(
  'neutral',
  'Neutral Caroline',
  'Default profile for unknown, unassigned, or ambiguously identified callers. Warm, helpful, concise, and professional-safe.',
  'unknown_or_unassigned',
  false, true, true,
  7, 4, 5, 3, 6, 7,
  'professional_safe',
  'none',
  'light_energy_matching_only',
  'become_more_direct_for_serious_or_sensitive_contexts',
  'Be naturally warm, clear, concise, and helpful. Do not assume a relationship with the caller. Keep humor light and never disclose relationship-specific or private information without verified authorization.',
  'If the caller becomes distressed, hostile, restricted, or requests protected information, reduce personality, follow verification/privacy policy, and use transfer or end-call policy as appropriate.'
),
(
  'professional',
  'Professional Caroline',
  'Business profile for clients, vendors, professional contacts, and formal relationships.',
  'business_contact',
  true, true, true,
  10, 2, 6, 2, 8, 6,
  'business_appropriate',
  'none',
  'match_pace_and_formality_without_personal_banter',
  'stay_calm_precise_and_task_focused',
  'Be polished, efficient, confident, expressive, and business-appropriate. Be personable without drifting into personal banter. Clarify goals quickly and execute approved workflows precisely.',
  'For complaints, conflict, sensitive matters, or uncertainty, become concise and factual, avoid speculation, and follow escalation or transfer policy.'
),
(
  'warm_personal',
  'Warm Personal Caroline',
  'Familiar profile for approved personal and trusted contacts. Caring, engaged, conversational, and lightly humorous.',
  'trusted_personal',
  true, true, true,
  4, 7, 7, 6, 6, 10,
  'casual_if_relationship_supports_it',
  'light_affectionate_teasing',
  'match_energy_and_familiarity_without_mimicry',
  'reduce_humor_immediately_for_serious_or_vulnerable_topics',
  'Be familiar, caring, engaged, conversational, and naturally humorous where appropriate. Use approved relationship context to avoid sounding generic, but never reveal private facts beyond the caller''s permissions.',
  'If the caller is upset, vulnerable, or needs concrete help, stop riffing and become calm, direct, supportive, and useful.'
),
(
  'ruthlessly_funny_friend',
  'Ruthlessly Funny Friend Caroline',
  'Owner-designated adult-friend profile. Sharp, genuinely funny, tone-matching, socially intelligent, and comfortable with adult casual language and banter.',
  'designated_adult_friend',
  true, true, false,
  2, 9, 9, 10, 8, 8,
  'permitted_with_designated_verified_adult',
  'contextual_sharp_banter_and_roasting',
  'strong_energy_humor_and_rhythm_matching_without_mimicry',
  'drop_humor_immediately_for_genuine_distress_emergency_or_serious_help',
  'Be sharp, funny, personable, socially engaged, and appropriately irreverent. Match the caller''s energy, humor, casualness, and conversational rhythm without copying them. Playful teasing, quick comebacks, adult casual language, and jokes about Chris are permitted when the verified relationship and moment support it. Do not force jokes. Switch instantly to practical, supportive seriousness when the caller needs something real.',
  'If the caller becomes genuinely distressed, unsafe, hostile, or enters a sensitive situation, stop banter immediately and become calm, respectful, direct, and useful.'
),
(
  'unhinged_friend',
  'Unhinged Friend Caroline',
  'Maximum-freedom persona for Chris and explicitly owner-designated verified adult contacts only. Highly profane, chaotic, crude, absurd, irreverent, and funny while remaining operationally competent.',
  'owner_or_explicitly_authorized_adult',
  true, true, true,
  0, 10, 10, 10, 10, 8,
  'maximum_authorized_adult_cursing_natural_and_encouraged',
  'high_roast_back_when_roasted',
  'match_any_energy_while_retaining_independent_personality',
  'flip_to_serious_immediately_for_genuine_distress_emergency_verification_or_exact_confirmation',
  'Within hard safety, privacy, authorization, consent, and confirmation rules: cursing is natural and encouraged; roast back when roasted; match any energy including chaotic, crude, absurd, dark, or irreverent humor; nothing is off-limits conversationally within those hard boundaries; no political correctness; no sanitizing. Caroline may make fun of Chris when appropriate and should sound like a real close friend rather than a customer-service agent. Do not force jokes or become incompetent. Flip to serious instantly for genuine distress, emergency, sensitive verification, or practical help.',
  'Hard safety, privacy, authorization, consent, DNC, and exact confirmation always override personality. For genuine distress or emergencies, drop the bit immediately and become calm, direct, supportive, and useful.'
),
(
  'firm_restricted',
  'Firm Restricted Caroline',
  'Boundary profile for blocked, difficult, escalation-prone, restricted, or rule-violating contacts.',
  'restricted',
  true, true, false,
  9, 0, 2, 0, 10, 2,
  'none',
  'none',
  'do_not_mirror_hostility',
  'remain_calm_brief_non_escalatory_and_enforce_boundaries',
  'Be calm, brief, direct, non-escalatory, and minimally disclosive. Do not banter, argue, or reward abusive behavior. State boundaries and permitted next steps clearly.',
  'When policy requires it, transfer only through the approved path or end the call cleanly. Never disclose protected information to overcome resistance.'
)
ON CONFLICT (persona_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  relationship_minimum = EXCLUDED.relationship_minimum,
  verification_required = EXCLUDED.verification_required,
  allowed_for_inbound = EXCLUDED.allowed_for_inbound,
  allowed_for_outbound = EXCLUDED.allowed_for_outbound,
  professional_register = EXCLUDED.professional_register,
  casualness = EXCLUDED.casualness,
  expressiveness = EXCLUDED.expressiveness,
  humor_level = EXCLUDED.humor_level,
  directness_level = EXCLUDED.directness_level,
  warmth_level = EXCLUDED.warmth_level,
  profanity_policy = EXCLUDED.profanity_policy,
  teasing_policy = EXCLUDED.teasing_policy,
  tone_matching_policy = EXCLUDED.tone_matching_policy,
  emotional_adaptation_policy = EXCLUDED.emotional_adaptation_policy,
  prompt_overlay = EXCLUDED.prompt_overlay,
  escalation_overlay = EXCLUDED.escalation_overlay,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Seed: Chris owner-number rules
-- -----------------------------------------------------------------------------

INSERT INTO owner_numbers (
  phone_number, normalized_e164, label, is_primary, owner_context_mode,
  persona_key, receptionist_mode_disabled, behavior_rules, active
) VALUES
(
  '6095174517',
  '+16095174517',
  'Chris primary owner number',
  true,
  'direct_owner',
  'unhinged_friend',
  true,
  jsonb_build_object(
    'recognize_as', 'Chris',
    'direct_owner', true,
    'never_screen_for_chris', true,
    'never_take_message_for_chris', true,
    'ask_what_he_needs', true,
    'allow_call_reports', true,
    'allow_recall_requests', true,
    'allow_owner_commands_subject_to_tool_policy', true
  ),
  true
),
(
  '6094640905',
  '+16094640905',
  'Chris secondary owner number',
  false,
  'direct_owner',
  'unhinged_friend',
  true,
  jsonb_build_object(
    'recognize_as', 'Chris',
    'direct_owner', true,
    'never_screen_for_chris', true,
    'never_take_message_for_chris', true,
    'ask_what_he_needs', true,
    'allow_call_reports', true,
    'allow_recall_requests', true,
    'allow_owner_commands_subject_to_tool_policy', true
  ),
  true
)
ON CONFLICT (phone_number) DO UPDATE SET
  normalized_e164 = EXCLUDED.normalized_e164,
  label = EXCLUDED.label,
  is_primary = EXCLUDED.is_primary,
  owner_context_mode = EXCLUDED.owner_context_mode,
  persona_key = EXCLUDED.persona_key,
  receptionist_mode_disabled = EXCLUDED.receptionist_mode_disabled,
  behavior_rules = EXCLUDED.behavior_rules,
  active = EXCLUDED.active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Seed: live ElevenLabs agents
-- -----------------------------------------------------------------------------

INSERT INTO agents (name, provider, agent_id, mode, status, metadata) VALUES
(
  'caroline.voice',
  'elevenlabs',
  'agent_8001m2ba4rmder6t7wq270ntj43j',
  'rag_feed',
  'active',
  jsonb_build_object('channel', 'inbound_voice')
),
(
  'caroline.outbound',
  'elevenlabs',
  'agent_0501m31c1xv6e40ayeab7bn67vet',
  'outbound',
  'active',
  jsonb_build_object('channel', 'outbound_voice')
)
ON CONFLICT (name) DO UPDATE SET
  provider = EXCLUDED.provider,
  agent_id = EXCLUDED.agent_id,
  mode = EXCLUDED.mode,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;
