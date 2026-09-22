import { coreCalendarRead, coreContactResolve, coreHold, coreInit, coreReentryAck, coreRetrieve, coreSms, validEdgeCoreRequest } from './core.ts'
import { json } from './http.ts'
import { signPayload, verifyPayload } from './security.ts'
import { putEventReceipt } from './state.ts'
import type { CoreOperation, EdgeCoreRequest, Env } from './types.ts'

const MAX_BODY_BYTES = 2 * 1024 * 1024

async function rawBody(req: Request): Promise<string | null> {
  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.byteLength > MAX_BODY_BYTES) return null
  return new TextDecoder().decode(bytes)
}

async function signedCoreResponse(body: Record<string, unknown>, status: number, env: Env): Promise<Response> {
  if (!env.CORE_RUNTIME_KEY) return json({ error: 'core_runtime_key_not_configured' }, 503)
  const raw = JSON.stringify(body)
  const signature = await signPayload(raw, env.CORE_RUNTIME_KEY)
  return new Response(raw, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Caroline-Signature': signature,
    },
  })
}

const PATH_OPERATION: Record<string, CoreOperation> = {
  '/v1/init': 'init',
  '/v1/retrieve': 'retrieve',
  '/v1/phone/contact-resolve': 'phone_contact_resolve',
  '/v1/phone/sms': 'phone_sms',
  '/v1/phone/calendar-read': 'phone_calendar_read',
  '/v1/phone/hold': 'phone_hold',
  '/v1/phone/reentry-ack': 'phone_reentry_ack',
}

async function handleCore(req: Request, env: Env, operation: CoreOperation): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const raw = await rawBody(req)
  if (raw === null) return json({ error: 'payload_too_large' }, 413)
  if (!(await verifyPayload(raw, req.headers.get('X-Caroline-Signature'), env.CORE_RUNTIME_KEY))) {
    return json({ error: 'invalid_signature' }, 401)
  }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return json({ error: 'invalid_json' }, 400) }
  if (!validEdgeCoreRequest(parsed)) return json({ error: 'invalid_core_request' }, 400)
  const envelope = parsed as EdgeCoreRequest
  if (envelope.operation !== operation || req.headers.get('X-Caroline-Operation') !== operation) {
    return json({ error: 'operation_mismatch' }, 400)
  }
  if (req.headers.get('X-Caroline-Request-Id') !== envelope.request_id) return json({ error: 'request_id_mismatch' }, 400)

  let result: { status: number; body: Record<string, unknown> }
  switch (operation) {
    case 'init': result = await coreInit(env, envelope.input); break
    case 'retrieve': result = await coreRetrieve(env, envelope.input); break
    case 'phone_contact_resolve': result = { status: 200, body: await coreContactResolve(env, envelope.input) }; break
    case 'phone_sms': result = { status: 200, body: await coreSms(env, envelope.input) }; break
    case 'phone_calendar_read': result = { status: 200, body: await coreCalendarRead(env, envelope.input) }; break
    case 'phone_hold': result = { status: 200, body: await coreHold(env, envelope.input) }; break
    case 'phone_reentry_ack': result = { status: 200, body: await coreReentryAck(env, envelope.input) }; break
  }
  return signedCoreResponse(result.body, result.status, env)
}

async function handleEventSink(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const raw = await rawBody(req)
  if (raw === null) return json({ error: 'payload_too_large' }, 413)
  if (!(await verifyPayload(raw, req.headers.get('X-Caroline-Signature'), env.EVENT_SINK_KEY))) {
    return json({ error: 'invalid_signature' }, 401)
  }
  let value: unknown
  try { value = JSON.parse(raw) } catch { return json({ error: 'invalid_json' }, 400) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'invalid_event' }, 400)
  const event = value as Record<string, unknown>
  if (event.schema_version !== '1' || typeof event.event_id !== 'string' || event.source !== 'elevenlabs') return json({ error: 'invalid_event' }, 400)
  const stored = await putEventReceipt(env, event.event_id, {
    schema_version: '1', event_id: event.event_id, request_id: event.request_id ?? null,
    source: event.source, source_event_type: event.source_event_type ?? null,
    payload_sha256: event.payload_sha256 ?? null, received_at: new Date().toISOString(),
  })
  if (!stored) return json({ error: 'mock_state_not_configured' }, 503)
  return new Response(null, { status: 204 })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/health' && req.method === 'GET') return json({ ok: true, service: 'caroline-core-mock', release: '1.0.0' })
    if (url.pathname === '/status' && req.method === 'GET') {
      return json({ ok: true, service: 'caroline-core-mock', release: '1.0.0', configured: {
        core_runtime_key: Boolean(env.CORE_RUNTIME_KEY), event_sink_key: Boolean(env.EVENT_SINK_KEY), mock_state: Boolean(env.MOCK_STATE),
      } })
    }
    if (url.pathname === '/v1/events/elevenlabs') return handleEventSink(req, env)
    const operation = PATH_OPERATION[url.pathname]
    if (operation) return handleCore(req, env, operation)
    return json({ error: 'not_found' }, 404)
  },
}
