import type { Env } from '../types.ts'
import { json } from '../lib/http.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { verifyTwilioRequest } from '../lib/twilio-security.ts'
import { registerTwilioCall, type TwilioCallDirection } from '../lib/elevenlabs-twilio.ts'

const TWILIO_REQUEST_MAX_BYTES = 256 * 1024
const CALL_STATE_TTL_SECONDS = 8 * 24 * 60 * 60
const CALL_STATUSES = new Set([
  'queued', 'initiated', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled',
])

async function incrementRejectedCounter(env: Env): Promise<void> {
  const kv = env.CAROLINE_PHONE
  if (!kv) return
  const hour = new Date().toISOString().slice(0, 13)
  const key = `security:${env.ENVIRONMENT ?? 'unknown'}:twilio_rejected:${hour}`
  try {
    const previous = Number(await kv.get(key) ?? '0')
    const next = Number.isFinite(previous) && previous >= 0 ? previous + 1 : 1
    await kv.put(key, String(next), { expirationTtl: CALL_STATE_TTL_SECONDS })
  } catch {
    // Security telemetry is best-effort; never emit request/auth details to logs.
  }
}

function value(form: URLSearchParams, key: string, maxLength = 256): string {
  const raw = (form.get(key) ?? '').trim()
  return raw.length <= maxLength ? raw : ''
}

function validCallSid(callSid: string): boolean {
  return callSid.startsWith('CA') && callSid.length >= 4 && callSid.length <= 64 && /^[A-Za-z0-9]+$/.test(callSid)
}

async function persistCallState(env: Env, callSid: string, patch: Record<string, unknown>): Promise<boolean> {
  const kv = env.CAROLINE_PHONE
  if (!kv) return false
  const key = `twilio:call:${callSid}`
  try {
    let previous: Record<string, unknown> = {}
    const raw = await kv.get(key)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) previous = parsed as Record<string, unknown>
      } catch {
        previous = {}
      }
    }
    const next = {
      ...previous,
      call_sid: callSid,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    await kv.put(key, JSON.stringify(next), { expirationTtl: CALL_STATE_TTL_SECONDS })
    return true
  } catch {
    return false
  }
}

async function handleRegisterCall(
  form: URLSearchParams,
  direction: TwilioCallDirection,
  env: Env,
  requestId: string,
  fetcher: typeof fetch,
): Promise<Response> {
  const callSid = value(form, 'CallSid', 64)
  const fromNumber = value(form, 'From', 128)
  const toNumber = value(form, 'To', 128)
  const answeredBy = value(form, 'AnsweredBy', 64)
  if (!validCallSid(callSid) || !fromNumber || !toNumber) return json({ error: 'invalid_twilio_call' }, 400, requestId)

  const result = await registerTwilioCall(env, {
    callSid,
    fromNumber,
    toNumber,
    direction,
    ...(answeredBy ? { answeredBy } : {}),
  }, fetcher)

  if (!result.ok) {
    if (result.reason === 'not_configured') return json({ error: 'voice_routing_not_configured' }, 503, requestId)
    return json({ error: 'elevenlabs_register_call_failed' }, 502, requestId)
  }

  // Call-start persistence is secondary to establishing the live call. Do not fail TwiML if KV is unavailable.
  await persistCallState(env, callSid, {
    direction,
    registration_status: 'registered',
    registered_at: new Date().toISOString(),
    ...(answeredBy ? { answered_by: answeredBy } : {}),
  })

  return new Response(result.twiml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'x-request-id': requestId,
    },
  })
}

async function handleStatusCallback(form: URLSearchParams, env: Env, requestId: string): Promise<Response> {
  const callSid = value(form, 'CallSid', 64)
  const callStatus = value(form, 'CallStatus', 64)
  const direction = value(form, 'Direction', 64)
  if (!validCallSid(callSid) || !CALL_STATUSES.has(callStatus)) return json({ error: 'invalid_status_callback' }, 400, requestId)

  const stored = await persistCallState(env, callSid, {
    call_status: callStatus,
    status_at: new Date().toISOString(),
    ...(direction ? { direction } : {}),
  })
  if (!stored) return json({ error: 'call_state_unavailable' }, 503, requestId)
  return json({ ok: true }, 200, requestId)
}

async function handleAmdCallback(form: URLSearchParams, env: Env, requestId: string): Promise<Response> {
  const callSid = value(form, 'CallSid', 64)
  const answeredBy = value(form, 'AnsweredBy', 64)
  if (!validCallSid(callSid) || !answeredBy) return json({ error: 'invalid_amd_callback' }, 400, requestId)

  const stored = await persistCallState(env, callSid, {
    answered_by: answeredBy,
    amd_at: new Date().toISOString(),
  })
  if (!stored) return json({ error: 'call_state_unavailable' }, 503, requestId)
  return json({ ok: true }, 200, requestId)
}

export async function handleTwilioWebhook(
  req: Request,
  env: Env,
  requestId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestId)

  let rawBody = ''
  try {
    ({ rawBody } = await readBodyWithLimit(req, TWILIO_REQUEST_MAX_BYTES))
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: 'payload_too_large' }, 413, requestId)
    throw error
  }

  if (!(await verifyTwilioRequest(req, rawBody, env.TWILIO_AUTH_TOKEN))) {
    await incrementRejectedCounter(env)
    return json({ error: 'forbidden' }, 403, requestId)
  }

  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return json({ error: 'unsupported_media_type' }, 415, requestId)
  }

  const form = new URLSearchParams(rawBody)
  const path = new URL(req.url).pathname
  if (path === '/twilio/inbound') return handleRegisterCall(form, 'inbound', env, requestId, fetcher)
  if (path === '/twilio/outbound') return handleRegisterCall(form, 'outbound', env, requestId, fetcher)
  if (path === '/twilio/status') return handleStatusCallback(form, env, requestId)
  if (path === '/twilio/amd') return handleAmdCallback(form, env, requestId)

  // Keep the old generic webhook intentionally disabled during the register-call migration.
  if (path.startsWith('/webhook/twilio')) return json({ error: 'twilio_routing_not_enabled' }, 503, requestId)
  return json({ error: 'not_found' }, 404, requestId)
}
