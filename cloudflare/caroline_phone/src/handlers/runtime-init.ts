import type { Env } from '../types.ts'
import {
  getCanonicalCallerProfile,
  getCanonicalPermissions,
  loadCanonicalConfig,
} from '../lib/canonical.ts'
import {
  buildElevenLabsInitResponse,
  normalizeDynamicVariables,
  roleFromVariables,
  toolIdsForInit,
} from '../lib/init-contract.ts'
import { json } from '../lib/http.ts'
import { log } from '../lib/log.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { sha256Hex, verifyRuntimeKey } from '../lib/security.ts'
import { createPendingNeonSession, type SessionInteractionMode } from '../lib/session-model.ts'
import { persistSession } from '../lib/session-store.ts'

const INIT_REQUEST_MAX_BYTES = 64 * 1024

interface InitInput extends Record<string, unknown> {
  conversation_id: string
  caller_id?: string
  interaction_mode?: string
  outbound_call?: boolean
}

function validInitInput(value: unknown): value is InitInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (typeof input.conversation_id !== 'string' || input.conversation_id.length < 1 || input.conversation_id.length > 256) return false
  if (input.caller_id !== undefined && (typeof input.caller_id !== 'string' || input.caller_id.length > 128)) return false
  if (input.interaction_mode !== undefined && (typeof input.interaction_mode !== 'string' || input.interaction_mode.length > 64)) return false
  if (input.outbound_call !== undefined && typeof input.outbound_call !== 'boolean') return false
  return true
}

function sessionMode(input: InitInput): SessionInteractionMode {
  if (input.outbound_call === true || input.interaction_mode === 'outbound') return 'outbound'
  if (input.interaction_mode === 'inbound_owner') return 'inbound_owner'
  if (input.interaction_mode === 'inbound_external') return 'inbound_external'
  return 'unknown'
}

function pendingInitSource(): Record<string, unknown> {
  return {
    schema_version: '1',
    dynamic_variables: {
      caller_identity_status: 'unknown',
      caller_access_tier: 'tier_0_unknown_unverified',
      caller_tone_profile: 'professional',
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
      call_answering_status: 'canonical_pending',
      call_answering_reason: '',
      call_reentry_notice_pending: 'false',
      outbound_authorization_status: 'not_authorized',
      bio_short: '',
      extended_bio: '',
      caroline_persona_facts: '',
      integration__telegram_chat_id: '',
    },
  }
}

export async function handleRuntimeInit(req: Request, env: Env, requestId: string): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestId)
  if (!verifyRuntimeKey(req, env.CAROLINE_KEY)) return json({ error: 'forbidden' }, 403, requestId)
  if (!(req.headers.get('content-type')?.toLowerCase() ?? '').includes('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415, requestId)
  }

  let rawBody: string
  try { ({ rawBody } = await readBodyWithLimit(req, INIT_REQUEST_MAX_BYTES)) } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: 'payload_too_large' }, 413, requestId)
    throw error
  }

  let input: unknown
  try { input = JSON.parse(rawBody) } catch { return json({ error: 'invalid_json' }, 400, requestId) }
  if (!validInitInput(input)) return json({ error: 'invalid_init_request' }, 400, requestId)

  const [profile, permissions, canonicalConfig] = await Promise.all([
    getCanonicalCallerProfile(env, input),
    getCanonicalPermissions(env, input),
    loadCanonicalConfig(env),
  ])

  // Until Neon exists, do not infer identity, permissions, or admission from edge-local state.
  if (profile.status !== 'ready' || permissions.status !== 'ready' || canonicalConfig.status !== 'ready') {
    const source = pendingInitSource()
    const response = buildElevenLabsInitResponse(source, env, input)
    if (!response) return json({ error: 'runtime_init_response_invalid' }, 500, requestId)

    const vars = normalizeDynamicVariables(source.dynamic_variables)
    const toolIds = toolIdsForInit(env, vars, input)
    const callerBindingHash = input.caller_id ? await sha256Hex(input.caller_id.trim()) : undefined
    const session = createPendingNeonSession({
      conversation_id: input.conversation_id,
      interaction_mode: sessionMode(input),
      ...(callerBindingHash ? { caller_binding_hash: callerBindingHash } : {}),
      tool_ids: toolIds,
    })
    const persisted = await persistSession(env, session)
    if (persisted !== 'ok') {
      log('error', 'runtime_init_session_persist_failed', { request_id: requestId, reason: persisted })
      return json({ error: 'session_store_unavailable' }, 503, requestId)
    }
    return json(response, 200, requestId)
  }

  // PENDING_NEON_INTEGRATION: ready mapping is intentionally unreachable until
  // the canonical Neon adapters are implemented. Do not invent a completed path.
  log('error', 'runtime_init_neon_adapter_missing', { request_id: requestId })
  return json({ error: 'canonical_adapter_not_implemented' }, 503, requestId)
}
