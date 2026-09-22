import type { Env } from '../types.ts'
import { getCanonicalRagContext } from '../lib/canonical.ts'
import { json } from '../lib/http.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { sha256Hex, verifyRuntimeKey } from '../lib/security.ts'
import { loadSession } from '../lib/session-store.ts'

const RETRIEVE_REQUEST_MAX_BYTES = 32 * 1024
const MODES = new Set(['inbound_owner', 'inbound_external', 'outbound'])

interface RetrievalInput extends Record<string, unknown> {
  conversation_id: string
  caller_phone: string
  interaction_mode: 'inbound_owner' | 'inbound_external' | 'outbound'
  current_query: string
  recent_turns?: string
  session_summary?: string
}

function validText(value: unknown, max: number, required = true): value is string {
  if (typeof value !== 'string') return !required && value === undefined
  return value.length <= max && (!required || value.trim().length > 0)
}

function parseInput(value: unknown): RetrievalInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (!validText(body.conversation_id, 256)) return null
  if (!validText(body.caller_phone, 128)) return null
  if (typeof body.interaction_mode !== 'string' || !MODES.has(body.interaction_mode)) return null
  if (!validText(body.current_query, 4000)) return null
  if (!validText(body.recent_turns, 12000, false)) return null
  if (!validText(body.session_summary, 6000, false)) return null
  return body as RetrievalInput
}

export async function handleRuntimeRetrieve(req: Request, env: Env, requestId: string): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestId)
  if (!verifyRuntimeKey(req, env.CAROLINE_KEY)) return json({ error: 'forbidden' }, 403, requestId)
  if (!(req.headers.get('content-type')?.toLowerCase() ?? '').includes('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415, requestId)
  }

  let rawBody: string
  try { ({ rawBody } = await readBodyWithLimit(req, RETRIEVE_REQUEST_MAX_BYTES)) } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: 'payload_too_large' }, 413, requestId)
    throw error
  }

  let rawInput: unknown
  try { rawInput = JSON.parse(rawBody) } catch { return json({ error: 'invalid_json' }, 400, requestId) }
  const input = parseInput(rawInput)
  if (!input) return json({ error: 'invalid_retrieval_request' }, 400, requestId)

  const session = await loadSession(env, input.conversation_id)
  if (session === 'not_configured') return json({ error: 'session_store_unavailable' }, 503, requestId)
  if (!session) return json({ error: 'session_not_initialized' }, 409, requestId)
  if (session.caller_binding_hash && await sha256Hex(input.caller_phone.trim()) !== session.caller_binding_hash) {
    return json({ error: 'forbidden' }, 403, requestId)
  }
  if (session.call_answering_status !== 'allowed' || !session.permission_snapshot.can_retrieve) {
    return json({ error: 'forbidden' }, 403, requestId)
  }

  const result = await getCanonicalRagContext(env, input)
  if (result.status !== 'ready') return json({ error: 'canonical_context_pending' }, 503, requestId)
  return json({ authorized: true, context: result.value.context, results: result.value.results.slice(0, 10) }, 200, requestId)
}
