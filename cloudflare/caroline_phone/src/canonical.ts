export type CallDirection = 'inbound' | 'outbound'
export type DynamicValue = string | number | boolean

export const SAFE_DYNAMIC_DEFAULTS: Record<string, DynamicValue> = {
  // Compact phone-runtime contract consumed directly by the active ElevenLabs prompts.
  call_mode: 'inbound',
  caller_name: 'there',
  relationship_summary: 'No prior context is available.',
  access_tier: 'tier_0_unknown_unverified',
  call_objective: 'Assist within approved capabilities.',
  approved_context: 'No additional context is available.',
  voicemail_detected: false,
  secret__contact_id: '',
  secret__call_session_id: '',

  // Canonical context surface retained for policy/retrieval migration and tools.
  caroline_context_json: '',
  caller_access_tier: 'tier_0_unknown_unverified',
  caller_tone_profile: 'professional',
  caller_identity_status: 'unknown',
  caller_relationship_context: '',
  caller_permissions_json: '{}',
  caller_recent_history: '',
  caroline_active_instructions: '',
  availability_status: '',
  calendar_share_level: 'none',
  calendar_current_activity: 'null',
  calendar_next_event: 'null',
  outbound_call_brief_json: '{}',
  caller_persona_profile_json: 'null',
  session_energy: 'neutral',
  call_answering_status: 'allowed',
  call_answering_reason: '',
  call_reentry_notice_pending: 'false',
  bio_short: '',
  extended_bio: '',
  caroline_persona_facts: '',
  integration__telegram_chat_id: '',
}

export type CanonicalCallContext = {
  dynamic_variables?: Record<string, DynamicValue>
}

export async function loadCanonicalCallContext(_input: {
  call_sid: string
  direction: CallDirection
  from_number: string
  to_number: string
}): Promise<CanonicalCallContext | null> {
  // PENDING_NEON_INTEGRATION:
  // Neon will become the canonical source for identity, permissions, relationship,
  // admission, memory/RAG context, availability, and outbound brief data.
  // This boundary intentionally has no Supabase, D1, KV, or caller-supplied fallback.
  return null
}

export async function buildCallStartVariables(input: {
  call_sid: string
  direction: CallDirection
  from_number: string
  to_number: string
}): Promise<Record<string, DynamicValue>> {
  const variables: Record<string, DynamicValue> = {
    ...SAFE_DYNAMIC_DEFAULTS,
    call_mode: input.direction,
    secret__call_session_id: input.call_sid,
    caroline_context_json: JSON.stringify({
      source: 'cloudflare_phone',
      call_sid: input.call_sid,
      direction: input.direction,
      canonical_context: 'pending_neon',
    }),
  }

  const canonical = await loadCanonicalCallContext(input)
  if (!canonical?.dynamic_variables) return variables

  for (const [key, value] of Object.entries(canonical.dynamic_variables)) {
    if (Object.prototype.hasOwnProperty.call(SAFE_DYNAMIC_DEFAULTS, key)) {
      variables[key] = value
    }
  }

  return variables
}
