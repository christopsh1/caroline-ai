import { patchCallSession, type CallSessionBinding } from './call-session'
import { registerElevenLabsCall } from './elevenlabs'
import { verifyTwilioFormRequest } from './twilio-security'

export { CallSession } from './call-session'

export type Env = {
  TWILIO_AUTH_TOKEN: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_AGENT_ID: string
  ELEVENLABS_BRANCH_ID?: string
  CALL_SESSION: CallSessionBinding
}

const FALLBACK_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this line is temporarily unavailable.</Say><Hangup/></Response>'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function xml(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })
}

function required(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim()
  return value ? value : null
}

async function verifiedTwilioForm(request: Request, env: Env): Promise<{ raw: string; params: URLSearchParams } | null> {
  if (!env.TWILIO_AUTH_TOKEN) return null
  const raw = await request.text()
  const valid = await verifyTwilioFormRequest(request, raw, env.TWILIO_AUTH_TOKEN)
  if (!valid) return null
  return { raw, params: new URLSearchParams(raw) }
}

async function handleVoice(request: Request, env: Env, direction: 'inbound' | 'outbound'): Promise<Response> {
  const verified = await verifiedTwilioForm(request, env)
  if (!verified) return json({ error: 'forbidden' }, 403)

  const callSid = required(verified.params, 'CallSid')
  const fromNumber = required(verified.params, 'From')
  const toNumber = required(verified.params, 'To')
  if (!callSid || !fromNumber || !toNumber) return json({ error: 'invalid_twilio_payload' }, 400)

  try {
    await patchCallSession(env.CALL_SESSION, callSid, {
      direction,
      from_number: fromNumber,
      to_number: toNumber,
      register_status: 'registering',
    })

    const twiml = await registerElevenLabsCall(env, {
      call_sid: callSid,
      direction,
      from_number: fromNumber,
      to_number: toNumber,
    })

    await patchCallSession(env.CALL_SESSION, callSid, {
      register_status: 'registered',
      registered_at: new Date().toISOString(),
    })

    return xml(twiml)
  } catch {
    try {
      await patchCallSession(env.CALL_SESSION, callSid, { register_status: 'register_failed' })
    } catch {
      // The safe telephony fallback must still be returned even if persistence is unavailable.
    }
    return xml(FALLBACK_TWIML)
  }
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const verified = await verifiedTwilioForm(request, env)
  if (!verified) return json({ error: 'forbidden' }, 403)

  const callSid = required(verified.params, 'CallSid')
  const callStatus = required(verified.params, 'CallStatus')
  if (!callSid || !callStatus) return json({ error: 'invalid_twilio_payload' }, 400)

  try {
    await patchCallSession(env.CALL_SESSION, callSid, { call_status: callStatus })
    return new Response(null, { status: 204 })
  } catch {
    return json({ error: 'state_unavailable' }, 503)
  }
}

async function handleAmd(request: Request, env: Env): Promise<Response> {
  const verified = await verifiedTwilioForm(request, env)
  if (!verified) return json({ error: 'forbidden' }, 403)

  const callSid = required(verified.params, 'CallSid')
  const answeredBy = required(verified.params, 'AnsweredBy')
  if (!callSid || !answeredBy) return json({ error: 'invalid_twilio_payload' }, 400)

  try {
    await patchCallSession(env.CALL_SESSION, callSid, { answered_by: answeredBy })
    return new Response(null, { status: 204 })
  } catch {
    return json({ error: 'state_unavailable' }, 503)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'caroline-phone',
        canonical_context: 'pending_neon',
        telephony_control: 'cloudflare',
      })
    }

    if (request.method !== 'POST') return json({ error: 'not_found' }, 404)

    if (url.pathname === '/twilio/inbound') return handleVoice(request, env, 'inbound')
    if (url.pathname === '/twilio/outbound') return handleVoice(request, env, 'outbound')
    if (url.pathname === '/twilio/status') return handleStatus(request, env)
    if (url.pathname === '/twilio/amd') return handleAmd(request, env)

    return json({ error: 'not_found' }, 404)
  },
}
