import { createCallMapping, patchCallSession, type CallSessionBinding } from './call-session'
import { registerElevenLabsCall, runtimeForDirection } from './elevenlabs'
import { verifyElevenLabsWebhook } from './elevenlabs-security'
import { claimEvent, EventLedger, type EventLedgerBinding } from './event-ledger'
import { handleElevenLabsTool } from './tools'
import { verifyTwilioFormRequest } from './twilio-security'

export { CallSession } from './call-session'
export { EventLedger }

export type QueueBinding = {
  send(message: unknown): Promise<void>
}

export type Env = {
  TWILIO_AUTH_TOKEN?: string
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_TOOL_SECRET?: string
  ELEVENLABS_WEBHOOK_SECRET?: string
  ELEVENLABS_INBOUND_AGENT_ID: string
  ELEVENLABS_OUTBOUND_AGENT_ID: string
  ELEVENLABS_INBOUND_BRANCH_ID?: string
  ELEVENLABS_OUTBOUND_BRANCH_ID?: string
  CALL_SESSION: CallSessionBinding
  EVENT_LEDGER?: EventLedgerBinding
  POST_CALL_QUEUE?: QueueBinding
}

const FALLBACK_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this line is temporarily unavailable.</Say><Hangup/></Response>'
const TOOL_ROUTES = new Set([
  '/elevenlabs/tools/customer-lookup',
  '/elevenlabs/tools/search-knowledge',
  '/elevenlabs/tools/get-availability',
  '/elevenlabs/tools/prepare-action',
  '/elevenlabs/tools/commit-action',
  '/elevenlabs/tools/transfer',
])

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
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

function expiresAt(hours = 2): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
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

  const runtime = runtimeForDirection(env as Parameters<typeof runtimeForDirection>[0], direction)
  const callContextId = crypto.randomUUID()

  try {
    await createCallMapping(env.CALL_SESSION, {
      call_context_id: callContextId,
      call_sid: callSid,
      direction,
      selected_agent_id: runtime.agentId,
      from_number: fromNumber,
      to_number: toNumber,
      register_status: 'registering',
      expires_at: expiresAt(),
    })

    const twiml = await registerElevenLabsCall(env as Parameters<typeof registerElevenLabsCall>[0], {
      call_sid: callSid,
      call_context_id: callContextId,
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

async function handlePostCall(request: Request, env: Env): Promise<Response> {
  if (!env.ELEVENLABS_WEBHOOK_SECRET || !env.EVENT_LEDGER || !env.POST_CALL_QUEUE) {
    return json({ ok: false, error: 'post_call_not_configured' }, 503)
  }

  const rawBody = await request.text()
  const valid = await verifyElevenLabsWebhook(
    rawBody,
    request.headers.get('elevenlabs-signature'),
    env.ELEVENLABS_WEBHOOK_SECRET,
  )
  if (!valid) return json({ ok: false, error: 'invalid_signature' }, 401)

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const type = typeof event?.type === 'string' ? event.type : 'unknown'
  const conversationId = typeof event?.data?.conversation_id === 'string' ? event.data.conversation_id : 'unknown'
  const timestamp = String(event?.event_timestamp ?? 'unknown')
  const eventId = `elevenlabs:${type}:${conversationId}:${timestamp}`

  const claimed = await claimEvent(env.EVENT_LEDGER, eventId)
  if (!claimed) return json({ ok: true, duplicate: true })

  try {
    await env.POST_CALL_QUEUE.send({
      event_id: eventId,
      type,
      conversation_id: conversationId,
      event,
    })
  } catch {
    return json({ ok: false, error: 'queue_send_failed' }, 503)
  }

  return json({ ok: true, queued: true })
}

async function health(env: Env): Promise<Response> {
  return json({
    ok: true,
    service: 'caroline-phone',
    conversational_runtime: 'elevenlabs-native',
    live_model_proxy: false,
    inbound_agent_configured: Boolean(env.ELEVENLABS_INBOUND_AGENT_ID),
    outbound_agent_configured: Boolean(env.ELEVENLABS_OUTBOUND_AGENT_ID),
    elevenlabs_api_secret_configured: Boolean(env.ELEVENLABS_API_KEY),
    twilio_secret_configured: Boolean(env.TWILIO_AUTH_TOKEN),
    tool_auth_configured: Boolean(env.ELEVENLABS_TOOL_SECRET),
    post_call_webhook_configured: Boolean(env.ELEVENLABS_WEBHOOK_SECRET && env.EVENT_LEDGER && env.POST_CALL_QUEUE),
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') return health(env)
    if (request.method !== 'POST') return json({ error: 'not_found' }, 404)

    if (url.pathname === '/twilio/inbound') return handleVoice(request, env, 'inbound')
    if (url.pathname === '/twilio/outbound') return handleVoice(request, env, 'outbound')
    if (url.pathname === '/twilio/status') return handleStatus(request, env)
    if (url.pathname === '/twilio/amd') return handleAmd(request, env)
    if (TOOL_ROUTES.has(url.pathname)) return handleElevenLabsTool(request, env, url.pathname)
    if (url.pathname === '/elevenlabs/webhooks/post-call') return handlePostCall(request, env)

    // Intentionally no /v1/chat/completions route: ElevenLabs owns the live LLM runtime.
    return json({ error: 'not_found' }, 404)
  },
}
