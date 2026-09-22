import type { Env, MockSession } from './types.ts'

type FixtureProfile = Partial<Pick<MockSession,
  'identity_status' | 'access_tier' | 'tone_profile' | 'persona_profile_json' |
  'relationship_context' | 'permissions_json' | 'calendar_share_level' |
  'call_answering_status' | 'call_reentry_notice_pending' | 'bio_short'>>

const BUILTIN_FIXTURES: Record<string, FixtureProfile> = {
  '+15550000001': {
    identity_status: 'verified_owner', access_tier: 'tier_owner', tone_profile: 'professional_clean',
    persona_profile_json: '{"assigned_persona_tag":"DIRECT_NO_NONSENSE"}', permissions_json: '{"owner":true}',
    calendar_share_level: 'details', bio_short: 'Chris',
  },
  '+15550000002': {
    identity_status: 'verified', access_tier: 'tier_2_personal_contact', tone_profile: 'match_tone_casual',
    persona_profile_json: '{"assigned_persona_tag":"CASUAL_NO_SWEARING"}',
    relationship_context: '[{"relationship_type":"close friend","relationship_scope":"owner"}]',
    calendar_share_level: 'none',
  },
  '+15550000003': {
    identity_status: 'verified', access_tier: 'tier_1_professional', tone_profile: 'professional_clean',
    persona_profile_json: '{"assigned_persona_tag":"PROFESSIONAL_DEFAULT"}', calendar_share_level: 'busy_only',
  },
  '+15550000004': {
    identity_status: 'verified', access_tier: 'tier_2_personal_contact', tone_profile: 'professional_clean',
    call_answering_status: 'restricted', calendar_share_level: 'none',
  },
  '+15550000005': {
    identity_status: 'verified', access_tier: 'tier_2_personal_contact', tone_profile: 'match_tone_casual',
    call_reentry_notice_pending: true, calendar_share_level: 'none',
  },
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function userFixtures(env: Env): Record<string, FixtureProfile> {
  if (!env.MOCK_CALLER_PROFILES_JSON) return {}
  try {
    const parsed = JSON.parse(env.MOCK_CALLER_PROFILES_JSON)
    if (!isObject(parsed)) return {}
    return parsed as Record<string, FixtureProfile>
  } catch {
    return {}
  }
}

export function sessionForInit(env: Env, conversationId: string, callerId: string): MockSession {
  const profile = userFixtures(env)[callerId] ?? BUILTIN_FIXTURES[callerId] ?? {}
  const now = new Date().toISOString()
  return {
    schema_version: '1',
    conversation_id: conversationId,
    caller_id: callerId,
    identity_status: profile.identity_status ?? 'unknown',
    access_tier: profile.access_tier ?? 'tier_0_unknown_unverified',
    tone_profile: profile.tone_profile ?? 'professional',
    persona_profile_json: profile.persona_profile_json ?? 'null',
    relationship_context: profile.relationship_context ?? '',
    permissions_json: profile.permissions_json ?? '{}',
    calendar_share_level: profile.calendar_share_level ?? 'none',
    call_answering_status: profile.call_answering_status ?? 'allowed',
    call_reentry_notice_pending: profile.call_reentry_notice_pending ?? false,
    bio_short: profile.bio_short ?? '',
    created_at: now,
    updated_at: now,
  }
}
