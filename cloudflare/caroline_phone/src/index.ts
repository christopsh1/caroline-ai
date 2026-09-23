import {
  createOutboundCallWithElevenLabs,
  registerInboundCallWithElevenLabs,
  UpstreamError,
} from './elevenlabs.ts'
import {
  constantTimeEqual,
  isFormRequest,
  isJsonRequest,
  json,
  logOperational,
  methodNotAllowed,
  requestId,
  safeInboundFailureTwiml,
  unsupportedMediaType,
  xml,
} from './http.ts'
import {
  getTwilioCallFields,
  isE164,
  isReasonableCallSid,
  parseTwilioForm,
  verifyTwilioSignature,
} from './twilio.ts'
import type { Env, OutboundCallRequest } from './types.ts'

const ROUTES = new Map<string, string>([
  ['/health', 'GET'],
  ['/twilio/inbound', 'POST'],
  ['/calls/outbound', 'POST'],
  ['/twilio/status', 'POST'],
])

function outboundAuthToken(env: Env): string {
  return env.OUTBOUND_API_TOKEN ?? env.CAROLINE_KEY ?? ''
}

function suppliedOutboundToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? ''
  if (authorization.startsWith('Bearer ')) return authorization.slice('Bearer '.length).trim()
  return (request.headers.get('x-caroline-key') ?? '').trim()
}

async function readVerifiedTwilioForm(request: Request, env: Env): Promise<URLSearchParams | Response> {
  if (!isFormRequest(request)) return unsupportedMediaType()
  if (!env.TWILIO_AUTH_TOKEN) return json({ ok: false, error: 'twilio_signature_verification_not_configured' }, 503)

  const rawBody = await request.text()
  if (!(await verifyTwilioSignature(request, rawBody, env.TWILIO_AUTH_TOKEN))) {
    return json({ ok: false, error: 'forbidden' }, 403)
  }
  return parseTwilioForm(rawBody)
}

async function handleInbound(request: Request, env: Env): Promise<Response> {
  const rid = requestId(request)
  const verified = await readVerifiedTwilioForm(request, env)
  if (verified instanceof Response) {
    logOperational({ route: '/twilio/inbound', request_id: rid, status: 'rejected' })
    return verified
  }

  const fields = getTwilioCallFields(verified)
  if (!fields.callSid || !fields.from || !fields.to || !isReasonableCallSid(fields.callSid)) {
    logOperational({ route: '/twilio/inbound', request_id: rid, call_sid: fields.callSid || undefined, status: 'rejected' })
    return json({ ok: false, error: 'invalid_twilio_payload' }, 400)
  }

  logOperational({ route: '/twilio/inbound', request_id: rid, call_sid: fields.callSid, status: 'verified' })

  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_AGENT_ID) {
    logOperational({ route: '/twilio/inbound', request_id: rid, call_sid: fields.callSid, status: 'upstream_error' })
    return xml(safeInboundFailureTwiml())
  }

  try {
    const twiml = await registerInboundCallWithElevenLabs(
      fetch,
      env.ELEVENLABS_API_KEY,
      env.ELEVENLABS_AGENT_ID,
      fields.from,
      fields.to,
    )
    logOperational({ route: '/twilio/inbound', request_id: rid, call_sid: fields.callSid, status: 'registered' })
    return xml(twiml)
  } catch (error) {
    const status = error instanceof UpstreamError && error.kind === 'timeout' ? 'upstream_timeout' : 'upstream_error'
    logOperational({ route: '/twilio/inbound', request_id: rid, call_sid: fields.callSid, status })
    return xml(safeInboundFailureTwiml())
  }
}

function validateMetadata(metadata: unknown): metadata is Record<string, unknown> | undefined {
  if (metadata === undefined) return true
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  try {
    return new TextEncoder().encode(JSON.stringify(metadata)).byteLength <= 8_192
  } catch {
    return false
  }
}

async function handleOutbound(request: Request, env: Env): Promise<Response> {
  const rid = requestId(request)
  if (!isJsonRequest(request)) return unsupportedMediaType()

  const expectedToken = outboundAuthToken(env)
  if (!expectedToken) return json({ ok: false, error: 'outbound_authorization_not_configured' }, 503)
  const suppliedToken = suppliedOutboundToken(request)
  if (!suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    logOperational({ route: '/calls/outbound', request_id: rid, status: 'rejected' })
    return json({ ok: false, error: 'forbidden' }, 403)
  }

  let body: OutboundCallRequest
  try {
    body = (await request.json()) as OutboundCallRequest
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!isE164(body.to)) return json({ ok: false, error: 'invalid_to' }, 400)
  if (body.first_message !== undefined && (typeof body.first_message !== 'string' || body.first_message.length > 2_000)) {
    return json({ ok: false, error: 'invalid_first_message' }, 400)
  }
  if (!validateMetadata(body.metadata)) return json({ ok: false, error: 'invalid_metadata' }, 400)

  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_AGENT_ID || !env.ELEVENLABS_AGENT_PHONE_NUMBER_ID) {
    return json({ ok: false, error: 'elevenlabs_outbound_not_configured' }, 503)
  }

  try {
    const result = await createOutboundCallWithElevenLabs(fetch, env.ELEVENLABS_API_KEY, {
      agentId: env.ELEVENLABS_AGENT_ID,
      agentPhoneNumberId: env.ELEVENLABS_AGENT_PHONE_NUMBER_ID,
      to: body.to,
      firstMessage: body.first_message ?? '',
    })

    logOperational({
      route: '/calls/outbound',
      request_id: rid,
      call_sid: result.callSid ?? undefined,
      status: result.success ? 'accepted' : 'upstream_error',
    })

    if (!result.success) return json({ ok: false, error: 'outbound_call_rejected' }, 502)
    return json({
      ok: true,
      conversation_id: result.conversation_id ?? null,
      call_sid: result.callSid ?? null,
    })
  } catch (error) {
    const timeout = error instanceof UpstreamError && error.kind === 'timeout'
    logOperational({ route: '/calls/outbound', request_id: rid, status: timeout ? 'upstream_timeout' : 'upstream_error' })
    return json({ ok: false, error: timeout ? 'upstream_timeout' : 'upstream_error' }, timeout ? 504 : 502)
  }
}

async function recordCallStatusEvent(event: {
  route: string
  requestId: string
  callSid: string
  status: string
}): Promise<void> {
  logOperational({
    route: event.route,
    request_id: event.requestId,
    call_sid: event.callSid,
    status: event.status || 'status_callback',
  })
}

async function handleStatus(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const rid = requestId(request)
  const verified = await readVerifiedTwilioForm(request, env)
  if (verified instanceof Response) {
    logOperational({ route: '/twilio/status', request_id: rid, status: 'rejected' })
    return verified
  }

  const fields = getTwilioCallFields(verified)
  if (!fields.callSid || !isReasonableCallSid(fields.callSid)) {
    return json({ ok: false, error: 'invalid_twilio_payload' }, 400)
  }

  ctx.waitUntil(
    recordCallStatusEvent({
      route: '/twilio/status',
      requestId: rid,
      callSid: fields.callSid,
      status: fields.callStatus,
    }),
  )
  return json({ ok: true })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const allowedMethod = ROUTES.get(url.pathname)
    if (!allowedMethod) return json({ ok: false, error: 'not_found' }, 404)
    if (request.method !== allowedMethod) return methodNotAllowed(allowedMethod)

    try {
      if (url.pathname === '/health') return json({ ok: true, service: 'caroline-phone' })
      if (url.pathname === '/twilio/inbound') return await handleInbound(request, env)
      if (url.pathname === '/calls/outbound') return await handleOutbound(request, env)
      if (url.pathname === '/twilio/status') return await handleStatus(request, env, ctx)
      return json({ ok: false, error: 'not_found' }, 404)
    } catch {
      logOperational({ route: url.pathname, request_id: requestId(request), status: 'internal_error' })
      return json({ ok: false, error: 'internal_error' }, 500)
    }
  },
}
