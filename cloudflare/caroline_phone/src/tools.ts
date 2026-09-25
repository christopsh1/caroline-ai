import { getCallSession, type CallSessionBinding, type CallSessionState } from './call-session'

export type ToolEnv = {
  ELEVENLABS_TOOL_SECRET?: string
  CAROLINE_BACKEND_URL?: string
  CAROLINE_BACKEND_TOKEN?: string
  ACTION_CONFIRMATION_SECRET?: string
  CALL_SESSION: CallSessionBinding
}

type Json = Record<string, unknown>

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function authorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const bearer = request.headers.get('authorization')
  const direct = request.headers.get('x-caroline-tool-key')
  return bearer === `Bearer ${secret}` || direct === secret
}

function cleanString(value: unknown, max = 1000): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, max) : undefined
}

function cleanBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function cleanObject(value: unknown, maxBytes = 4096): Json | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const encoded = JSON.stringify(value)
  if (encoded.length > maxBytes) return undefined
  return value as Json
}

function modelSafeSession(session: CallSessionState) {
  return {
    call_context_id: session.call_context_id,
    direction: session.direction,
    selected_agent_id: session.selected_agent_id,
    caller_phone_hint: session.from_number,
    destination_phone: session.to_number,
  }
}

async function backendRequest(env: ToolEnv, path: string, payload: Json): Promise<{ status: number; body: Json }> {
  if (!env.CAROLINE_BACKEND_URL || !env.CAROLINE_BACKEND_TOKEN) {
    return { status: 503, body: { ok: false, error: 'backend_not_configured' } }
  }

  const base = env.CAROLINE_BACKEND_URL.replace(/\/$/, '')
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.CAROLINE_BACKEND_TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return { status: 502, body: { ok: false, error: 'backend_unavailable' } }
  }

  let body: Json = {}
  try {
    body = (await response.json()) as Json
  } catch {
    body = { ok: false, error: 'invalid_backend_response' }
  }
  return { status: response.status, body }
}

const encoder = new TextEncoder()

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function issueConfirmationToken(env: ToolEnv, callContextId: string, actionId: string, ttlSeconds = 120) {
  if (!env.ACTION_CONFIRMATION_SECRET) throw new Error('confirmation_secret_not_configured')
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `${callContextId}.${actionId}.${expiresAt}`
  const signature = await hmacHex(env.ACTION_CONFIRMATION_SECRET, payload)
  return { token: `${expiresAt}.${signature}`, expires_at: expiresAt }
}

async function verifyConfirmationToken(
  env: ToolEnv,
  callContextId: string,
  actionId: string,
  token: string,
): Promise<boolean> {
  if (!env.ACTION_CONFIRMATION_SECRET) return false
  const [expiresRaw, supplied] = token.split('.', 2)
  const expiresAt = Number(expiresRaw)
  if (!Number.isInteger(expiresAt) || !supplied || expiresAt < Math.floor(Date.now() / 1000)) return false
  if (expiresAt > Math.floor(Date.now() / 1000) + 10 * 60) return false
  const expected = await hmacHex(env.ACTION_CONFIRMATION_SECRET, `${callContextId}.${actionId}.${expiresAt}`)
  return constantTimeEqual(expected, supplied.toLowerCase())
}

function safeCustomer(body: Json) {
  const identityStatus = cleanString(body.identity_status, 64) ?? 'unverified'
  if (identityStatus !== 'verified') {
    return {
      identity_status: identityStatus,
      verification_required: cleanBool(body.verification_required) ?? true,
      protected_data_disclosed: false,
    }
  }
  return {
    identity_status: 'verified',
    display_name: cleanString(body.display_name, 120),
    access_tier: cleanString(body.access_tier, 80),
    relationship_summary: cleanString(body.relationship_summary, 500),
    verification_required: false,
    protected_data_disclosed: true,
  }
}

function safeKnowledge(body: Json) {
  const source = Array.isArray(body.results) ? body.results : []
  const results = source.slice(0, 5).map((row) => {
    const item = row && typeof row === 'object' ? (row as Json) : {}
    return {
      title: cleanString(item.title, 160),
      snippet: cleanString(item.snippet, 1200),
      source_type: cleanString(item.source_type, 80),
    }
  })
  return { results }
}

function safeAvailability(body: Json) {
  const source = Array.isArray(body.windows) ? body.windows : []
  const windows = source.slice(0, 8).map((row) => {
    const item = row && typeof row === 'object' ? (row as Json) : {}
    return {
      start: cleanString(item.start, 80),
      end: cleanString(item.end, 80),
      status: cleanString(item.status, 40),
    }
  })
  return {
    status: cleanString(body.status, 80),
    timezone: cleanString(body.timezone, 80),
    windows,
  }
}

async function parseToolRequest(request: Request, env: ToolEnv): Promise<{ body: Json; session: CallSessionState } | Response> {
  if (!authorized(request, env.ELEVENLABS_TOOL_SECRET)) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: Json
  try {
    body = (await request.json()) as Json
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const callContextId = cleanString(body.call_context_id, 128) ?? ''
  if (!callContextId) return json({ ok: false, error: 'call_context_id_required' }, 400)

  const session = await getCallSession(env.CALL_SESSION, callContextId)
  if (!session) return json({ ok: false, error: 'call_context_not_found' }, 404)
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) {
    return json({ ok: false, error: 'call_context_expired' }, 410)
  }
  return { body, session }
}

export async function handleElevenLabsTool(request: Request, env: ToolEnv, pathname: string): Promise<Response> {
  const parsed = await parseToolRequest(request, env)
  if (parsed instanceof Response) return parsed
  const { body, session } = parsed
  const context = modelSafeSession(session)

  if (pathname === '/elevenlabs/tools/customer-lookup') {
    const verification = cleanObject(body.verification, 2048)
    const result = await backendRequest(env, '/tools/customer-lookup', { context, verification })
    if (result.status >= 400) return json({ ok: false, error: cleanString(result.body.error, 120) ?? 'backend_error' }, result.status)
    return json({ ok: true, caller: safeCustomer(result.body) })
  }

  if (pathname === '/elevenlabs/tools/search-knowledge') {
    const query = cleanString(body.query, 500)
    if (!query) return json({ ok: false, error: 'query_required' }, 400)
    const result = await backendRequest(env, '/tools/search-knowledge', { context, query })
    if (result.status >= 400) return json({ ok: false, error: cleanString(result.body.error, 120) ?? 'backend_error' }, result.status)
    return json({ ok: true, ...safeKnowledge(result.body) })
  }

  if (pathname === '/elevenlabs/tools/get-availability') {
    const requestText = cleanString(body.request, 500)
    const result = await backendRequest(env, '/tools/get-availability', { context, request: requestText })
    if (result.status >= 400) return json({ ok: false, error: cleanString(result.body.error, 120) ?? 'backend_error' }, result.status)
    return json({ ok: true, ...safeAvailability(result.body) })
  }

  if (pathname === '/elevenlabs/tools/prepare-action') {
    const actionType = cleanString(body.action_type, 80)
    const action = cleanObject(body.action, 4096)
    if (!actionType || !action) return json({ ok: false, error: 'action_required' }, 400)
    const result = await backendRequest(env, '/tools/prepare-action', { context, action_type: actionType, action })
    if (result.status >= 400) return json({ ok: false, error: cleanString(result.body.error, 120) ?? 'backend_error' }, result.status)
    const actionId = cleanString(result.body.action_id, 160)
    const summary = cleanString(result.body.summary, 800)
    if (!actionId || !summary) return json({ ok: false, error: 'invalid_prepare_response' }, 502)
    try {
      const confirmation = await issueConfirmationToken(env, session.call_context_id, actionId)
      return json({
        ok: true,
        action_id: actionId,
        summary,
        requires_explicit_confirmation: true,
        confirmation_token: confirmation.token,
        confirmation_expires_at: confirmation.expires_at,
      })
    } catch {
      return json({ ok: false, error: 'confirmation_not_configured' }, 503)
    }
  }

  if (pathname === '/elevenlabs/tools/commit-action' || pathname === '/elevenlabs/tools/transfer') {
    const actionId = cleanString(body.action_id, 160)
    const token = cleanString(body.confirmation_token, 512)
    const confirmed = body.confirmed === true
    if (!actionId || !token || !confirmed) return json({ ok: false, error: 'explicit_confirmation_required' }, 409)
    if (!(await verifyConfirmationToken(env, session.call_context_id, actionId, token))) {
      return json({ ok: false, error: 'invalid_or_expired_confirmation' }, 409)
    }

    const backendPath = pathname.endsWith('/transfer') ? '/tools/transfer' : '/tools/commit-action'
    const result = await backendRequest(env, backendPath, { context, action_id: actionId, confirmed: true })
    if (result.status >= 400) return json({ ok: false, error: cleanString(result.body.error, 120) ?? 'backend_error' }, result.status)
    return json({
      ok: result.body.ok !== false,
      status: cleanString(result.body.status, 80) ?? 'completed',
      reference: cleanString(result.body.reference, 160),
      summary: cleanString(result.body.summary, 800),
    })
  }

  return json({ ok: false, error: 'tool_not_found' }, 404)
}
