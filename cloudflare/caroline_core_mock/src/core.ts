import type { EdgeCoreRequest, Env, MockSession } from './types.ts'
import { sessionForInit } from './fixtures.ts'
import { getSession, putSession } from './state.ts'

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function str(value: unknown, max = 4000): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null
}

export function validEdgeCoreRequest(value: unknown): value is EdgeCoreRequest {
  if (!isObject(value) || value.schema_version !== '1') return false
  return typeof value.request_id === 'string'
    && typeof value.environment === 'string'
    && typeof value.operation === 'string'
    && typeof value.received_at === 'string'
    && isObject(value.input)
}

function dynamicVariables(session: MockSession): Record<string, string> {
  const context = {
    identity_status: session.identity_status,
    access_tier: session.access_tier,
    tone_profile: session.tone_profile,
    persona_profile: session.persona_profile_json === 'null' ? null : JSON.parse(session.persona_profile_json),
    call_answering: {
      status: session.call_answering_status,
      reentry_notice_pending: session.call_reentry_notice_pending,
    },
  }
  return {
    caroline_context_json: JSON.stringify(context),
    caller_access_tier: session.access_tier,
    caller_tone_profile: session.tone_profile,
    caller_identity_status: session.identity_status,
    caller_relationship_context: session.relationship_context,
    caller_permissions_json: session.permissions_json,
    caller_recent_history: '[]',
    caroline_active_instructions: '[]',
    availability_status: '',
    calendar_share_level: session.calendar_share_level,
    calendar_current_activity: 'null',
    calendar_next_event: 'null',
    outbound_call_brief_json: '{}',
    caller_persona_profile_json: session.persona_profile_json,
    session_energy: 'neutral',
    call_answering_status: session.call_answering_status,
    call_answering_reason: session.call_answering_status === 'allowed' ? '' : 'mock_policy',
    call_reentry_notice_pending: String(session.call_reentry_notice_pending),
    bio_short: session.bio_short,
    extended_bio: '',
    caroline_persona_facts: '',
    integration__telegram_chat_id: '',
  }
}

export async function coreInit(env: Env, input: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const conversationId = str(input.conversation_id, 256)
  if (!conversationId) return { status: 400, body: { error: 'conversation_id_required' } }
  const callerId = typeof input.caller_id === 'string' && input.caller_id.length <= 128 ? input.caller_id : ''
  const session = sessionForInit(env, conversationId, callerId)
  if (!(await putSession(env, session))) return { status: 503, body: { error: 'mock_state_not_configured' } }
  return {
    status: 200,
    body: {
      schema_version: '1',
      dynamic_variables: dynamicVariables(session),
      first_message: session.identity_status === 'verified_owner'
        ? 'Hi Chris — Caroline here. What do you need?'
        : undefined,
    },
  }
}

function retrievalAuthorized(session: MockSession, mode: unknown): boolean {
  if (session.call_answering_status !== 'allowed') return false
  if (mode === 'inbound_owner') return session.identity_status === 'verified_owner' || session.access_tier === 'tier_owner'
  if (mode === 'inbound_external') return session.identity_status.startsWith('verified') && session.access_tier !== 'tier_owner'
  if (mode === 'outbound') return session.identity_status !== 'unknown'
  return false
}

export async function coreRetrieve(env: Env, input: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const conversationId = str(input.conversation_id, 256)
  if (!conversationId) return { status: 400, body: { error: 'conversation_id_required' } }
  const session = await getSession(env, conversationId)
  if (!session || !retrievalAuthorized(session, input.interaction_mode)) {
    return { status: 200, body: { schema_version: '1', authorized: false, context: '', results: [] } }
  }
  const query = str(input.current_query, 4000) ?? ''
  return {
    status: 200,
    body: {
      schema_version: '1',
      authorized: true,
      context: `Development fixture context for ${session.access_tier}. Query: ${query.slice(0, 500)}`,
      results: [
        { type: 'mock_memory', text: 'This is synthetic development context only.', timestamp: '2026-09-22T00:00:00Z' },
      ],
    },
  }
}

async function sessionForAction(env: Env, input: Record<string, unknown>): Promise<MockSession | null> {
  const conversationId = str(input.conversation_id, 256)
  return conversationId ? getSession(env, conversationId) : null
}

export async function coreContactResolve(env: Env, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const session = await sessionForAction(env, input)
  const authorized = Boolean(session && session.call_answering_status === 'allowed' && (session.access_tier === 'tier_owner' || session.identity_status === 'verified_owner'))
  if (!authorized) return { schema_version: '1', authorized: false, unique: false, candidates: [] }
  const name = typeof input.name === 'string' ? input.name : ''
  return {
    schema_version: '1', authorized: true, unique: true,
    candidates: [{ display_name: name || 'Development Contact', phone: '+15550000999', contact_ref: 'mock-contact-1' }],
  }
}

export async function coreSms(env: Env, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const session = await sessionForAction(env, input)
  const authorized = Boolean(session && session.call_answering_status === 'allowed' && (session.access_tier === 'tier_owner' || session.identity_status === 'verified_owner'))
  if (!authorized) return { schema_version: '1', authorized: false, accepted: false, disposition: 'rejected' }
  const executeAt = typeof input.execute_at === 'string' ? input.execute_at : undefined
  return {
    schema_version: '1', authorized: true, accepted: true,
    disposition: executeAt ? 'scheduled' : 'queued',
    ...(executeAt ? { execute_at: executeAt } : {}),
  }
}

export async function coreCalendarRead(env: Env, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const session = await sessionForAction(env, input)
  if (!session || session.call_answering_status !== 'allowed') return { schema_version: '1', authorized: false, share_level: 'none', events: [] }
  const share = session.access_tier === 'tier_owner' ? 'details' : session.calendar_share_level
  if (share === 'none') return { schema_version: '1', authorized: false, share_level: 'none', events: [] }
  return {
    schema_version: '1', authorized: true, share_level: share,
    events: [{
      start_at: '2026-09-22T18:00:00-04:00', end_at: '2026-09-22T19:00:00-04:00', status: 'busy',
      title: 'Development Fixture Event', description: 'Synthetic detail for integration testing.', location: 'Development only',
    }],
  }
}

export async function coreHold(env: Env, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const session = await sessionForAction(env, input)
  if (!session || session.call_answering_status !== 'allowed' || session.access_tier === 'tier_owner' || session.identity_status === 'verified_owner') {
    return { schema_version: '1', authorized: false, held: false, state: 'rejected' }
  }
  const updated: MockSession = { ...session, call_answering_status: 'restricted', updated_at: new Date().toISOString() }
  await putSession(env, updated)
  return { schema_version: '1', authorized: true, held: true, state: 'active' }
}

export async function coreReentryAck(env: Env, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const session = await sessionForAction(env, input)
  if (!session || session.call_answering_status !== 'allowed' || !session.call_reentry_notice_pending) {
    return { schema_version: '1', authorized: false, acknowledged: false, message: '' }
  }
  await putSession(env, { ...session, call_reentry_notice_pending: false, updated_at: new Date().toISOString() })
  return { schema_version: '1', authorized: true, acknowledged: true, message: 'Re-entry acknowledgement recorded for this development conversation.' }
}
