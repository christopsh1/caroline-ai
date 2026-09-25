import { getCallSession, type CallSessionBinding } from './call-session'

export type ToolEnv = {
  ELEVENLABS_TOOL_SECRET?: string
  CALL_SESSION: CallSessionBinding
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function authorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function handleElevenLabsTool(request: Request, env: ToolEnv, pathname: string): Promise<Response> {
  if (!authorized(request, env.ELEVENLABS_TOOL_SECRET)) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const callContextId = typeof body.call_context_id === 'string' ? body.call_context_id.trim() : ''
  if (!callContextId) return json({ ok: false, error: 'call_context_id_required' }, 400)

  const session = await getCallSession(env.CALL_SESSION, callContextId)
  if (!session) return json({ ok: false, error: 'call_context_not_found' }, 404)
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) {
    return json({ ok: false, error: 'call_context_expired' }, 410)
  }

  if (pathname === '/elevenlabs/tools/customer-lookup') {
    // Until the approved database adapter is bound, expose only non-sensitive state
    // already established by the telephony control plane. Never return raw phone data.
    return json({
      ok: true,
      caller: {
        identity_status: 'unverified',
        protected_data_disclosed: false,
      },
    })
  }

  const knownRoutes = new Set([
    '/elevenlabs/tools/search-knowledge',
    '/elevenlabs/tools/get-availability',
    '/elevenlabs/tools/prepare-action',
    '/elevenlabs/tools/commit-action',
    '/elevenlabs/tools/transfer',
  ])

  if (knownRoutes.has(pathname)) {
    return json({
      ok: false,
      error: 'backend_not_configured',
      retryable: false,
    }, 503)
  }

  return json({ ok: false, error: 'tool_not_found' }, 404)
}
