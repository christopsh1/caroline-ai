import type { Env } from '../types.ts'
import { callCoreRuntime } from '../lib/core-runtime.ts'
import { buildElevenLabsInitResponse, INIT_RESPONSE_MAX_BYTES } from '../lib/init-contract.ts'
import { json } from '../lib/http.ts'
import { log } from '../lib/log.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { verifyRuntimeKey } from '../lib/security.ts'

const INIT_REQUEST_MAX_BYTES = 64 * 1024

function validInitInput(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  return typeof input.conversation_id === 'string' && input.conversation_id.length > 0 && input.conversation_id.length <= 256
}

export async function handleRuntimeInit(req: Request, env: Env, requestId: string): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestId)
  if (!verifyRuntimeKey(req, env.CAROLINE_RUNTIME_KEY)) return json({ error: 'unauthorized' }, 401, requestId)
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

  const core = await callCoreRuntime(env, 'init', input, requestId, INIT_RESPONSE_MAX_BYTES)
  if (!core.ok) {
    log('warn', 'runtime_init_core_failed', { request_id: requestId, reason: core.reason, upstream_status: core.status ?? null })
    return json({ error: core.reason }, core.reason === 'core_rejected' || core.reason === 'core_unreachable' ? 502 : 503, requestId)
  }

  const response = buildElevenLabsInitResponse(core.body, env)
  if (!response) {
    log('error', 'runtime_init_core_response_invalid', { request_id: requestId })
    return json({ error: 'invalid_core_init_response' }, 502, requestId)
  }

  return json(response, 200, requestId)
}
