import {
  createCallMapping,
  getCallSession,
  patchCallSession,
  patchCallSessionByContext,
  type CallSessionBinding,
} from './call-session'
import { registerElevenLabsCall, runtimeForDirection } from './elevenlabs'
import { verifyElevenLabsWebhook } from './elevenlabs-security'
import { claimEvent, EventLedger, releaseEvent, type EventLedgerBinding } from './event-ledger'
import { handleElevenLabsTool } from './tools'
import { verifyTwilioFormRequest } from './twilio-security'

// Caroline secrets bootstrap.
// Cloudflare secret bindings permitted on this Worker: GATEWAY_TOKEN and GATEWAY_URL only.
// Provider/application credentials are resolved from Infisical through secrets-gateway.
type RuntimeSecrets = {
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_FROM_NUMBER?: string
  OUTBOUND_ADMIN_TOKEN?: string
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_TOOL_SECRET?: string
  ELEVENLABS_WEBHOOK_SECRET?: string
  ACTION_CONFIRMATION_SECRET?: string
  CAROLINE_BACKEND_TOKEN?: string
}

type SecretsGatewayResponse = {
  ok?: unknown
  error?: unknown
  secrets?: unknown
}

const SECRETS_CACHE_TTL_MS = 5 * 60 * 1000
let _secrets: RuntimeSecrets | null = null
let _secretsExpiresAt = 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function getSecrets(env: Env): Promise<RuntimeSecrets> {
  const now = Date.now()
  if (_secrets && now < _secretsExpiresAt) return _secrets
  if (!env.GATEWAY_URL || !env.GATEWAY_TOKEN || !env.WORKER_NAME) {
    throw new Error('secrets_gateway_not_configured')
  }

  const resp = await fetch(
    `${env.GATEWAY_URL.replace(/\/+$/, '')}/secrets?worker=${encodeURIComponent(env.WORKER_NAME)}`,
    { headers: { Authorization: `Bearer ${env.GATEWAY_TOKEN}` } },
  )
  if (!resp.ok) throw new Error(`Secrets gateway error: ${resp.status}`)

  const data = (await resp.json()) as SecretsGatewayResponse
  if (data.ok !== true) {
    throw new Error(`Secrets gateway: ${typeof data.error === 'string' ? data.error : 'unknown_error'}`)
  }
  if (!isRecord(data.secrets)) throw new Error('secrets_gateway_invalid_payload')

  const resolved: RuntimeSecrets = {}
  for (const key of Object.keys(data.secrets) as Array<keyof RuntimeSecrets>) {
    const value = data.secrets[key]
    if (typeof value === 'string') resolved[key] = value
  }

  _secrets = resolved
  _secretsExpiresAt = now + SECRETS_CACHE_TTL_MS
  return resolved
}

export { CallSession } from './call-session'
export { EventLedger }

export type QueueBinding = {
  send(message: unknown): Promise<void>
}

type QueueMessage<T> = {
  body: T
  ack?: () => void
  retry?: () => void
}

type QueueBatch<T> = {
  messages: Array<QueueMessage<T>>
}

type PostCallQueueMessage = {
  event_id: string
  type: string
  conversation_id: string
  call_context_id?: string
  event_timestamp?: number | string
}

export type Env = {
  GATEWAY_TOKEN?: string
  GATEWAY_URL?: string
  WORKER_NAME: string
  CAROLINE_BACKEND_URL?: string
  CAROLINE_PHONE_PUBLIC_URL?: string
  CALL_CONTEXT_TTL_SECONDS?: string
  ENVIRONMENT?: string
  ELEVENLABS_INBOUND_AGENT_ID: string
  ELEVENLABS_OUTBOUND_AGENT_ID: string
  CALL_SESSION: CallSessionBinding
  EVENT_LEDGER?: EventLedgerBinding
  POST_CALL_QUEUE?: QueueBinding
}

type RuntimeEnv = Env & RuntimeSecrets

async function hydrateEnv(env: Env): Promise<RuntimeEnv> {
  const secrets = await getSecrets(env)
  return {
    ...env,
    TWILIO_ACCOUNT_SID: secrets.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: secrets.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: secrets.TWILIO_FROM_NUMBER,
    OUTBOUND_ADMIN_TOKEN: secrets.OUTBOUND_ADMIN_TOKEN,
    ELEVENLABS_API_KEY: secrets.ELEVENLABS_API_KEY,
    ELEVENLABS_TOOL_SECRET: secrets.ELEVENLABS_TOOL_SECRET,
    ELEVENLABS_WEBHOOK_SECRET: secrets.ELEVENLABS_WEBHOOK_SECRET,
    ACTION_CONFIRMATION_SECRET: secrets.ACTION_CONFIRMATION_SECRET,
    CAROLINE_BACKEND_TOKEN: secrets.CAROLINE_BACKEND_TOKEN,
  }
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

function contextTtlSeconds(env: Env): number {
  const parsed = Number(env.CALL_CONTEXT_TTL_SECONDS ?? '7200')
  return Number.isFinite(parsed) && parsed >= 300 && parsed <= 86400 ? Math.floor(parsed) : 7200
}

function expiresAt(env: Env): string {
  return new Date(Date.now() + contextTtlSeconds(env) * 1000).toISOString()
}

function validOpaqueContext(value: string | null): string | null {
  if (!value) return null
  return /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null
}

async function verifiedTwilioForm(request: Request, env: RuntimeEnv): Promise<{ raw: string; params: URLSearchParams } | null> {
  if (!env.TWILIO_AUTH_TOKEN) return null
  const raw = await request.text()
  const valid = await verifyTwilioFormRequest(request, raw, env.TWILIO_AUTH_TOKEN)
  if (!valid) return null
  return { raw, params: new URLSearchParams(raw) }
}

async function handleVoice(request: Request, env: RuntimeEnv, direction: 'inbound' | 'outbound'): Promise<Response> {
  const verified = await verifiedTwilioForm(request, env)
  if (!verified) return json({ error: 'forbidden' }, 403)
  if (!env.ELEVENLABS_API_KEY) return xml(FALLBACK_TWIML)

  const callSid = required(verified.params, 'CallSid')
  const fromNumber = required(verified.params, 'From')
  const toNumber = required(verified.params, 'To')
  if (!callSid || !fromNumber || !toNumber) return json({ error: 'invalid_twilio_payload' }, 400)

  const runtime = runtimeForDirection(env as Parameters<typeof runtimeForDirection>[0], direction)
  const existing = await getCallSession(env.CALL_SESSION, callSid)
  const suppliedContext = validOpaqueContext(new URL(request.url).searchParams.get('call_context_id'))
  const callContextId = existing?.call_context_id ?? suppliedContext ?? crypto.randomUUID()

  try {
    const mapping = await createCallMapping(env.CALL_SESSION, {
      call_context_id: callContextId,
      call_sid: callSid,
      direction,
      selected_agent_id: runtime.agentId,
      from_number: fromNumber,
      to_number: toNumber,
      register_status: 'registering',
      expires_at: existing?.expires_at ?? expiresAt(env),
    })

    await patchCallSession(env.CALL_SESSION, callSid, {
      direction,
      selected_agent_id: runtime.agentId,
      from_number: fromNumber,
      to_number: toNumber,
      register_status: 'registering',
    })

    const twiml = await registerElevenLabsCall(env as Parameters<typeof registerElevenLabsCall>[0], {
      call_sid: callSid,
      call_context_id: mapping.call_context_id,
      direction,
      from_number: fromNumber,
      to_number: toNumber,
    })

    await patchCallSession(env.CALL_SESSION, callSid, {
      register_status: 'registered',
      registered_at: new Date().toISOString(),
    })

    // Register Call returns TwiML. Return it byte-for-byte to Twilio.
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

function outboundAdminAuthorized(request: Request, env: RuntimeEnv): boolean {
  return Boolean(env.OUTBOUND_ADMIN_TOKEN && request.headers.get('authorization') === `Bearer ${env.OUTBOUND_ADMIN_TOKEN}`)
}

function e164(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null
}

async function handleOutboundAdmin(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!outboundAdminAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401)
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    return json({ ok: false, error: 'twilio_outbound_not_configured' }, 503)
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const to = e164(body.to)
  const from = e164(env.TWILIO_FROM_NUMBER)
  if (!to || !from) return json({ ok: false, error: 'valid_e164_number_required' }, 400)

  const callContextId = crypto.randomUUID()
  const origin = (env.CAROLINE_PHONE_PUBLIC_URL ?? new URL(request.url).origin).replace(/\/$/, '')
  const voiceUrl = `${origin}/twilio/outbound?call_context_id=${encodeURIComponent(callContextId)}`
  const statusUrl = `${origin}/twilio/status`
  const amdUrl = `${origin}/twilio/amd`
  const params = new URLSearchParams()
  params.set('To', to)
  params.set('From', from)
  params.set('Url', voiceUrl)
  params.set('Method', 'POST')
  params.set('StatusCallback', statusUrl)
  params.set('StatusCallbackMethod', 'POST')
  for (const event of ['initiated', 'ringing', 'answered', 'completed']) params.append('StatusCallbackEvent', event)
  params.set('MachineDetection', 'Enable')
  params.set('AsyncAmd', 'true')
  params.set('AsyncAmdStatusCallback', amdUrl)
  params.set('AsyncAmdStatusCallbackMethod', 'POST')
  params.set('Record', 'false')

  const twilioResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Calls.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: params.toString(),
    },
  )

  let twilioBody: Record<string, unknown> = {}
  try {
    twilioBody = (await twilioResponse.json()) as Record<string, unknown>
  } catch {
    twilioBody = {}
  }
  const callSid = typeof twilioBody.sid === 'string' ? twilioBody.sid : ''
  if (!twilioResponse.ok || !callSid) {
    return json({ ok: false, error: 'twilio_call_create_failed' }, 502)
  }

  await createCallMapping(env.CALL_SESSION, {
    call_context_id: callContextId,
    call_sid: callSid,
    direction: 'outbound',
    selected_agent_id: env.ELEVENLABS_OUTBOUND_AGENT_ID,
    from_number: from,
    to_number: to,
    register_status: 'pending',
    call_status: typeof twilioBody.status === 'string' ? twilioBody.status : 'queued',
    expires_at: expiresAt(env),
  })

  return json({ ok: true, call_context_id: callContextId, call_sid: callSid, status: twilioBody.status ?? 'queued' }, 202)
}

async function handleStatus(request: Request, env: RuntimeEnv): Promise<Response> {
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

async function handleAmd(request: Request, env: RuntimeEnv): Promise<Response> {
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

function extractCallContextId(event: any): string | undefined {
  const candidates = [
    event?.data?.conversation_initiation_client_data?.dynamic_variables?.call_context_id,
    event?.data?.metadata?.dynamic_variables?.call_context_id,
    event?.data?.dynamic_variables?.call_context_id,
  ]
  return candidates.find((value) => typeof value === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(value))
}

function extractTwilioCallSid(event: any): string | undefined {
  const candidates = [
    event?.data?.metadata?.body?.CallSid,
    event?.data?.metadata?.body?.CallSID,
    event?.data?.metadata?.phone_call?.external_id,
  ]
  return candidates.find((value) => typeof value === 'string' && value.length > 5)
}

async function handlePostCall(request: Request, env: RuntimeEnv): Promise<Response> {
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
  const eventTimestamp = event?.event_timestamp
  const eventId = typeof event?.event_id === 'string' && event.event_id.trim()
    ? event.event_id.trim()
    : `elevenlabs:${type}:${conversationId}:${String(eventTimestamp ?? 'unknown')}`

  const claimed = await claimEvent(env.EVENT_LEDGER, eventId)
  if (!claimed) return json({ ok: true, duplicate: true })

  let callContextId = extractCallContextId(event)
  if (!callContextId) {
    const callSid = extractTwilioCallSid(event)
    if (callSid) callContextId = (await getCallSession(env.CALL_SESSION, callSid))?.call_context_id
  }

  if (callContextId && conversationId !== 'unknown') {
    try {
      await patchCallSessionByContext(env.CALL_SESSION, callContextId, {
        elevenlabs_conversation_id: conversationId,
      })
    } catch {
      // The post-call payload is still queued; correlation can be reconciled asynchronously.
    }
  }

  const message: PostCallQueueMessage = {
    event_id: eventId,
    type,
    conversation_id: conversationId,
    call_context_id: callContextId,
    event_timestamp: eventTimestamp,
  }

  try {
    await env.POST_CALL_QUEUE.send(message)
  } catch {
    await releaseEvent(env.EVENT_LEDGER, eventId).catch(() => undefined)
    return json({ ok: false, error: 'queue_send_failed' }, 503)
  }

  return json({ ok: true, queued: true })
}

async function processPostCallMessage(message: PostCallQueueMessage, env: RuntimeEnv): Promise<void> {
  if (!env.ELEVENLABS_API_KEY || !env.CAROLINE_BACKEND_URL || !env.CAROLINE_BACKEND_TOKEN) {
    throw new Error('post_call_consumer_not_configured')
  }
  if (!message.conversation_id || message.conversation_id === 'unknown') throw new Error('conversation_id_missing')

  const conversationResponse = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(message.conversation_id)}`,
    { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, accept: 'application/json' } },
  )
  if (!conversationResponse.ok) throw new Error(`elevenlabs_conversation_${conversationResponse.status}`)
  const conversation = await conversationResponse.json()

  const backendResponse = await fetch(`${env.CAROLINE_BACKEND_URL.replace(/\/$/, '')}/post-call/process`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CAROLINE_BACKEND_TOKEN}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ ...message, conversation }),
  })
  if (!backendResponse.ok) throw new Error(`post_call_backend_${backendResponse.status}`)
}

async function health(env: Env): Promise<Response> {
  let runtime: RuntimeEnv
  try {
    runtime = await hydrateEnv(env)
  } catch {
    return json({
      ok: false,
      service: 'caroline-phone',
      environment: env.ENVIRONMENT ?? 'development',
      secrets_gateway_configured: Boolean(env.GATEWAY_URL && env.GATEWAY_TOKEN && env.WORKER_NAME),
      secrets_gateway_reachable: false,
    }, 503)
  }

  return json({
    ok: true,
    service: 'caroline-phone',
    environment: env.ENVIRONMENT ?? 'development',
    conversational_runtime: 'elevenlabs-native',
    live_model_proxy: false,
    openrouter_live_path: false,
    secrets_gateway_configured: true,
    secrets_gateway_reachable: true,
    inbound_agent_configured: Boolean(runtime.ELEVENLABS_INBOUND_AGENT_ID),
    outbound_agent_configured: Boolean(runtime.ELEVENLABS_OUTBOUND_AGENT_ID),
    elevenlabs_api_secret_configured: Boolean(runtime.ELEVENLABS_API_KEY),
    twilio_secret_configured: Boolean(runtime.TWILIO_AUTH_TOKEN),
    outbound_trigger_configured: Boolean(runtime.TWILIO_ACCOUNT_SID && runtime.TWILIO_FROM_NUMBER && runtime.OUTBOUND_ADMIN_TOKEN),
    tool_auth_configured: Boolean(runtime.ELEVENLABS_TOOL_SECRET),
    backend_configured: Boolean(runtime.CAROLINE_BACKEND_URL && runtime.CAROLINE_BACKEND_TOKEN),
    confirmation_secret_configured: Boolean(runtime.ACTION_CONFIRMATION_SECRET),
    post_call_webhook_configured: Boolean(runtime.ELEVENLABS_WEBHOOK_SECRET && runtime.EVENT_LEDGER && runtime.POST_CALL_QUEUE),
  })
}

function knownPostRoute(pathname: string): boolean {
  return pathname === '/twilio/inbound'
    || pathname === '/twilio/outbound'
    || pathname === '/twilio/status'
    || pathname === '/twilio/amd'
    || pathname === '/elevenlabs/webhooks/post-call'
    || TOOL_ROUTES.has(pathname)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') return health(env)
    if (request.method !== 'POST') return json({ error: 'not_found' }, 404)
    if (!knownPostRoute(url.pathname)) {
      // Intentionally no /v1/chat/completions route: ElevenLabs owns the live LLM runtime.
      return json({ error: 'not_found' }, 404)
    }

    let runtime: RuntimeEnv
    try {
      runtime = await hydrateEnv(env)
    } catch {
      return json({ ok: false, error: 'secrets_unavailable' }, 503)
    }

    if (url.pathname === '/twilio/inbound') return handleVoice(request, runtime, 'inbound')
    if (url.pathname === '/twilio/outbound') {
      if ((request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
        return handleOutboundAdmin(request, runtime)
      }
      return handleVoice(request, runtime, 'outbound')
    }
    if (url.pathname === '/twilio/status') return handleStatus(request, runtime)
    if (url.pathname === '/twilio/amd') return handleAmd(request, runtime)
    if (TOOL_ROUTES.has(url.pathname)) return handleElevenLabsTool(request, runtime, url.pathname)
    if (url.pathname === '/elevenlabs/webhooks/post-call') return handlePostCall(request, runtime)

    return json({ error: 'not_found' }, 404)
  },

  async queue(batch: QueueBatch<PostCallQueueMessage>, env: Env): Promise<void> {
    let runtime: RuntimeEnv
    try {
      runtime = await hydrateEnv(env)
    } catch {
      for (const message of batch.messages) message.retry?.()
      return
    }

    for (const message of batch.messages) {
      try {
        await processPostCallMessage(message.body, runtime)
        message.ack?.()
      } catch {
        message.retry?.()
      }
    }
  },
}
