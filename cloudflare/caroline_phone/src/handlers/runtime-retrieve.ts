import type { Env } from '../types.ts'
import { callCoreRuntime } from '../lib/core-runtime.ts'
import { json } from '../lib/http.ts'
import { log } from '../lib/log.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { verifyRuntimeKey } from '../lib/security.ts'

const RETRIEVE_REQUEST_MAX_BYTES = 32 * 1024
const RETRIEVE_RESPONSE_MAX_BYTES = 96 * 1024
const MODES = new Set(['inbound_owner', 'inbound_external', 'outbound'])

interface RetrievalInput {
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
  return {
    conversation_id: body.conversation_id as string,
    caller_phone: body.caller_phone as string,
    interaction_mode: body.interaction_mode as RetrievalInput['interaction_mode'],
    current_query: body.current_query as string,
    ...(typeof body.recent_turns === 'string' ? { recent_turns: body.recent_turns } : {}),
    ...(typeof body.session_summary === 'string' ? { session_summary: body.session_summary } : {}),
  }
}

function sanitizeCoreResult(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (body.schema_version !== '1' || typeof body.authorized !== 'boolean') return null
  if (!body.authorized) return { authorized: false, context: '', results: [] }

  const context = typeof body.context === 'string' ? body.context.slice(0, 32000) : ''
  const rawResults = Array.isArray(body.results) ? body.results : []
  const results = rawResults.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    if (typeof row.text !== 'string' || !row.text.trim()) return []
    return [{
      text: row.text.slice(0, 6000),
      ...(typeof row.type === 'string' ? { type: row.type.slice(0, 80) } : {}),
      ...(typeof row.timestamp === 'string' ? { timestamp: row.timestamp.slice(0, 64) } : {}),
    }]
  })
  const response = { authorized: true, context, results }
  return new TextEncoder().encode(JSON.stringify(response)).byteLength <= RETRIEVE_RESPONSE_MAX_BYTES ? response : null
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

  const core = await callCoreRuntime(env, 'retrieve', input, requestId, RETRIEVE_RESPONSE_MAX_BYTES)
  if (!core.ok) {
    log('warn', 'runtime_retrieve_core_failed', { request_id: requestId, reason: core.reason, upstream_status: core.status ?? null })
    return json({ error: 'upstream_unavailable' }, core.reason === 'core_rejected' || core.reason === 'core_unreachable' ? 502 : 503, requestId)
  }

  const response = sanitizeCoreResult(core.body)
  if (!response) return json({ error: 'invalid_core_retrieval_response' }, 502, requestId)
  return json(response, 200, requestId)
}
