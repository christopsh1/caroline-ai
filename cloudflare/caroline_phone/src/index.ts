import { CallSession, type CallState } from './call-session.ts'
import {
  completeTwilioCall,
  createTwilioOutboundCall,
  isE164,
  registerElevenLabsCall,
  shouldHangupForAmd,
  verifyTwilioFormRequest,
} from './telephony.ts'

export { CallSession }

interface Env {
  CALL_SESSIONS: DurableObjectNamespace
  ELEVENLABS_AGENT_ID: string
  ELEVENLABS_API_KEY: string
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_PHONE_NUMBER: string
  CAROLINE_KEY: string
  AMD_HANGUP_MACHINE?: string
}

const XML_HEADERS = { 'content-type': 'application/xml; charset=utf-8' }
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function xml(body: string): Response {
  return new Response(body, { status: 200, headers: XML_HEADERS })
}

function unavailableTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this line is temporarily unavailable.</Say><Hangup/></Response>'
}

function sameString(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  const length = Math.max(aa.length, bb.length)
  let diff = aa.length ^ bb.length
  for (let i = 0; i < length; i += 1) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

async function updateCallState(env: Env, callSid: string, patch: CallState): Promise<void> {
  const id = env.CALL_SESSIONS.idFromName(callSid)
  const stub = env.CALL_SESSIONS.get(id)
  await stub.fetch('https://call.internal/state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

async function getCallState(env: Env, callSid: string): Promise<CallState | null> {
  const id = env.CALL_SESSIONS.idFromName(callSid)
  const stub = env.CALL_SESSIONS.get(id)
  const response = await stub.fetch('https://call.internal/state')
  if (!response.ok) return null
  const data = (await response.json()) as { state?: CallState | null }
  return data.state ?? null
}

async function verifiedTwilioForm(request: Request, env: Env): Promise<URLSearchParams | Response> {
  if (!env.TWILIO_AUTH_TOKEN) return json({ error: 'provider_not_configured' }, 503)
  const rawBody = await request.text()
  if (!(await verifyTwilioFormRequest(request, rawBody, env.TWILIO_AUTH_TOKEN))) {
    return json({ error: 'forbidden' }, 403)
  }
  return new URLSearchParams(rawBody)
}

async function handleRegisterWebhook(request: Request, env: Env, direction: 'inbound' | 'outbound'): Promise<Response> {
  const verified = await verifiedTwilioForm(request, env)
  if (verified instanceof Response) return verified

  const callSid = verified.get('CallSid')?.trim() ?? ''
  const fromNumber = verified.get('From')?.trim() ?? ''
  const toNumber = verified.get('To')?.trim() ?? ''
  if (!callSid || !fromNumber || !toNumber) return xml(unavailableTwiml())

  const existing = direction === 'outbound' ? await getCallState(env, callSid) : null
  await updateCallState(env, callSid, {
    call_sid: callSid,
    direction,
    from_number: fromNumber,
    to_number: toNumber,
    status: 'registering',
  })

  try {
    if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_AGENT_ID) throw new Error('elevenlabs_not_configured')
    const twiml = await registerElevenLabsCall(fetch, env.ELEVENLABS_API_KEY, env.ELEVENLABS_AGENT_ID, {
      fromNumber,
      toNumber,
      direction,
      outboundBriefJson: existing?.outbound_call_brief_json,
    })
    await updateCallState(env, callSid, { status: 'registered', registered_at: new Date().toISOString() })
    return xml(twiml)
  } catch {
    await updateCallState(env, callSid, { status: 'register_failed' })
    return xml(unavailableTwiml())
  }
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const verified = await verifiedTwilioForm(request, env)
  if (verified instanceof Response) return verified
  const callSid = verified.get('CallSid')?.trim() ?? ''
  const status = verified.get('CallStatus')?.trim() ?? ''
  if (!callSid) return json({ error: 'call_sid_required' }, 400)
  const terminal = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled'])
  await updateCallState(env, callSid, {
    status: status || 'status_callback',
    ...(terminal.has(status) ? { completed_at: new Date().toISOString() } : {}),
  })
  return new Response(null, { status: 204 })
}

async function handleAmd(request: Request, env: Env): Promise<Response> {
  const verified = await verifiedTwilioForm(request, env)
  if (verified instanceof Response) return verified
  const callSid = verified.get('CallSid')?.trim() ?? ''
  const answeredBy = verified.get('AnsweredBy')?.trim() ?? ''
  if (!callSid) return json({ error: 'call_sid_required' }, 400)
  await updateCallState(env, callSid, { answered_by: answeredBy || 'unknown' })

  if (shouldHangupForAmd(answeredBy || null, env.AMD_HANGUP_MACHINE)) {
    try {
      await completeTwilioCall(fetch, { accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN }, callSid)
      await updateCallState(env, callSid, { status: 'amd_machine_hangup' })
    } catch {
      await updateCallState(env, callSid, { status: 'amd_hangup_failed' })
    }
  }
  return new Response(null, { status: 204 })
}

async function handleOutboundCreate(request: Request, env: Env): Promise<Response> {
  const suppliedKey = request.headers.get('x-caroline-key') ?? ''
  if (!env.CAROLINE_KEY || !sameString(suppliedKey, env.CAROLINE_KEY)) return json({ error: 'forbidden' }, 403)

  let body: { to_number?: unknown; brief?: unknown; machine_detection?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!isE164(body.to_number)) return json({ error: 'invalid_to_number' }, 400)
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    return json({ error: 'provider_not_configured' }, 503)
  }

  const briefJson = JSON.stringify(body.brief ?? {})
  if (new TextEncoder().encode(briefJson).byteLength > 10000) return json({ error: 'brief_too_large' }, 413)

  const origin = new URL(request.url).origin
  try {
    const created = await createTwilioOutboundCall(
      fetch,
      {
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        fromNumber: env.TWILIO_PHONE_NUMBER,
      },
      {
        toNumber: body.to_number,
        voiceUrl: `${origin}/twilio/outbound`,
        statusUrl: `${origin}/twilio/status`,
        amdUrl: `${origin}/twilio/amd`,
        machineDetection: body.machine_detection === true,
      },
    )
    await updateCallState(env, created.callSid, {
      call_sid: created.callSid,
      direction: 'outbound',
      to_number: body.to_number,
      status: created.status ?? 'queued',
      outbound_call_brief_json: briefJson,
    })
    return json({ ok: true, call_sid: created.callSid, status: created.status ?? 'queued' }, 201)
  } catch {
    return json({ ok: false, error: 'outbound_call_create_failed' }, 502)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({
          ok: true,
          service: 'caroline-phone',
          timestamp: new Date().toISOString(),
          configured: {
            durable_object: Boolean(env.CALL_SESSIONS),
            elevenlabs_agent: Boolean(env.ELEVENLABS_AGENT_ID),
            elevenlabs_api_key: Boolean(env.ELEVENLABS_API_KEY),
            twilio_account: Boolean(env.TWILIO_ACCOUNT_SID),
            twilio_auth: Boolean(env.TWILIO_AUTH_TOKEN),
            twilio_number: Boolean(env.TWILIO_PHONE_NUMBER),
            control_key: Boolean(env.CAROLINE_KEY),
          },
        })
      }
      if (request.method === 'POST' && url.pathname === '/twilio/inbound') return handleRegisterWebhook(request, env, 'inbound')
      if (request.method === 'POST' && url.pathname === '/twilio/outbound') return handleRegisterWebhook(request, env, 'outbound')
      if (request.method === 'POST' && url.pathname === '/twilio/status') return handleStatus(request, env)
      if (request.method === 'POST' && url.pathname === '/twilio/amd') return handleAmd(request, env)
      if (request.method === 'POST' && url.pathname === '/calls/outbound') return handleOutboundCreate(request, env)
      return json({ error: 'not_found' }, 404)
    } catch {
      return json({ error: 'internal_error' }, 500)
    }
  },
}
