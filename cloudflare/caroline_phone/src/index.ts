import { patchCallSession, type CallSessionBinding } from './call-session'
import { registerElevenLabsCall } from './elevenlabs'
import { LlmControl, type LlmControlBinding } from './llm-control'
import { customLlmStatus, ensureCustomLlmConfigured, handleCustomLlm } from './llm'
import { verifyTwilioFormRequest } from './twilio-security'

export { CallSession } from './call-session'
export { LlmControl }

export type Env = {
  TWILIO_AUTH_TOKEN?: string
  ELEVENLABS_API_KEY?: string
  OPENROUTER_API_KEY?: string
  ELEVENLABS_INBOUND_AGENT_ID: string
  ELEVENLABS_OUTBOUND_AGENT_ID: string
  ELEVENLABS_INBOUND_BRANCH_ID?: string
  ELEVENLABS_OUTBOUND_BRANCH_ID?: string
  CAROLINE_PHONE_PUBLIC_URL?: string
  CALL_SESSION: CallSessionBinding
  LLM_CONTROL?: LlmControlBinding
}

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void
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

function phoneRuntimeReady(env: Env): boolean {
  return Boolean(
    env.TWILIO_AUTH_TOKEN &&
      env.ELEVENLABS_API_KEY &&
      env.ELEVENLABS_INBOUND_AGENT_ID &&
      env.ELEVENLABS_OUTBOUND_AGENT_ID,
  )
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
  if (!env.ELEVENLABS_API_KEY) return xml(FALLBACK_TWIML)

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

    const twiml = await registerElevenLabsCall(env as Parameters<typeof registerElevenLabsCall>[0], {
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

async function health(env: Env): Promise<Response> {
  const llm = env.LLM_CONTROL
    ? await customLlmStatus(env as Parameters<typeof customLlmStatus>[0])
    : {
        openrouter_secret_configured: Boolean(env.OPENROUTER_API_KEY),
        gateway_secret_created: false,
        elevenlabs_secret_created: false,
        configured_version: null,
        configured_at: null,
        last_error: null,
      }

  return json({
    ok: true,
    service: 'caroline-phone',
    canonical_context: 'pending_neon',
    telephony_control: 'cloudflare',
    inbound_agent_configured: Boolean(env.ELEVENLABS_INBOUND_AGENT_ID),
    outbound_agent_configured: Boolean(env.ELEVENLABS_OUTBOUND_AGENT_ID),
    elevenlabs_secret_configured: Boolean(env.ELEVENLABS_API_KEY),
    twilio_secret_configured: Boolean(env.TWILIO_AUTH_TOKEN),
    openrouter_secret_configured: Boolean(env.OPENROUTER_API_KEY),
    phone_runtime_ready: phoneRuntimeReady(env),
    custom_llm: llm,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') return health(env)

    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
      if (!env.LLM_CONTROL) return json({ error: 'llm_control_unavailable' }, 503)
      return handleCustomLlm(request, env as Parameters<typeof handleCustomLlm>[1])
    }

    if (request.method !== 'POST') return json({ error: 'not_found' }, 404)

    if (url.pathname === '/twilio/inbound') return handleVoice(request, env, 'inbound')
    if (url.pathname === '/twilio/outbound') return handleVoice(request, env, 'outbound')
    if (url.pathname === '/twilio/status') return handleStatus(request, env)
    if (url.pathname === '/twilio/amd') return handleAmd(request, env)

    return json({ error: 'not_found' }, 404)
  },

  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContextLike): Promise<void> {
    if (!env.LLM_CONTROL) return
    ctx.waitUntil(
      ensureCustomLlmConfigured(env as Parameters<typeof ensureCustomLlmConfigured>[0]).catch(() => undefined),
    )
  },
}
