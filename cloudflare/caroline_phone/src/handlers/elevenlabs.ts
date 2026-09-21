import type { CarolineEventEnvelope, Env } from '../types'
import { deliverEvent } from '../lib/delivery'
import { deterministicEventId } from '../lib/event'
import { json } from '../lib/http'
import { log } from '../lib/log'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request'
import { likelyAlreadyDelivered, recordReceipt } from '../lib/receipts'
import { sha256Hex, verifyElevenLabsSignature } from '../lib/security'

const MAX_BODY_BYTES = 256 * 1024

type ElevenLabsEvent = {
  type?: unknown
  event_timestamp?: unknown
  data?: {
    conversation_id?: unknown
    [key: string]: unknown
  }
  [key: string]: unknown
}

export async function handleElevenLabsWebhook(req: Request, env: Env, requestId: string): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestId)

  const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415, requestId)
  }

  let rawBody: string
  try {
    ;({ rawBody } = await readBodyWithLimit(req, MAX_BODY_BYTES))
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      log('warn', 'elevenlabs_body_rejected', { request_id: requestId, reason: error.message })
      return json({ error: 'payload_too_large' }, 413, requestId)
    }
    throw error
  }

  const signature = req.headers.get('ElevenLabs-Signature')
  const verification = await verifyElevenLabsSignature(rawBody, signature, env.ELEVENLABS_WEBHOOK_SECRET)
  if (!verification.ok) {
    log('warn', 'elevenlabs_signature_rejected', { request_id: requestId, reason: verification.reason })
    return json(
      { error: verification.reason },
      verification.reason === 'webhook_secret_not_configured' ? 503 : 401,
      requestId,
    )
  }

  let event: ElevenLabsEvent
  try {
    event = JSON.parse(rawBody) as ElevenLabsEvent
  } catch {
    return json({ error: 'invalid_json' }, 400, requestId)
  }

  if (typeof event.type !== 'string' || !event.type) {
    return json({ error: 'event_type_required' }, 400, requestId)
  }

  const payloadHash = await sha256Hex(rawBody)
  const eventId = deterministicEventId(event, payloadHash)

  if (await likelyAlreadyDelivered(env, eventId)) {
    log('info', 'elevenlabs_replay_short_circuit', { request_id: requestId, event_id: eventId })
    return json({ ok: true, duplicate_likely: true, event_id: eventId }, 200, requestId)
  }

  const envelope: CarolineEventEnvelope<ElevenLabsEvent> = {
    schema_version: '1',
    event_id: eventId,
    request_id: requestId,
    environment: env.ENVIRONMENT ?? 'unknown',
    source: 'elevenlabs',
    source_event_type: event.type,
    source_event_timestamp:
      typeof event.event_timestamp === 'number' || typeof event.event_timestamp === 'string'
        ? event.event_timestamp
        : null,
    received_at: new Date().toISOString(),
    payload_sha256: payloadHash,
    payload: event,
  }

  const delivery = await deliverEvent(env, envelope)
  if (!delivery.ok) {
    log('warn', 'elevenlabs_delivery_failed', {
      request_id: requestId,
      event_id: eventId,
      reason: delivery.reason,
      upstream_status: delivery.status ?? null,
    })
    return json(
      {
        error: delivery.reason,
        event_id: eventId,
        ...(delivery.status ? { upstream_status: delivery.status } : {}),
      },
      delivery.reason === 'sink_rejected' || delivery.reason === 'sink_unreachable' ? 502 : 503,
      requestId,
    )
  }

  await recordReceipt(env, {
    source: 'elevenlabs',
    event_id: eventId,
    event_type: event.type,
    event_timestamp: envelope.source_event_timestamp,
    payload_sha256: payloadHash,
    request_id: requestId,
    delivered_at: new Date().toISOString(),
    environment: envelope.environment,
  })

  log('info', 'elevenlabs_event_delivered', {
    request_id: requestId,
    event_id: eventId,
    event_type: event.type,
    sink_status: delivery.status,
  })

  return json({ ok: true, event_id: eventId }, 200, requestId)
}
