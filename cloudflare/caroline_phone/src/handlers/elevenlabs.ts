import type { CarolineEventEnvelope, Env } from '../types.ts'
import { deterministicEventId } from '../lib/event.ts'
import { json } from '../lib/http.ts'
import { log } from '../lib/log.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { sha256Hex, verifyElevenLabsSignature } from '../lib/security.ts'
import { asyncPipelineReady, stageAndQueueEvent } from '../lib/staging.ts'

const MAX_BODY_BYTES = 2 * 1024 * 1024

type ElevenLabsEvent = {
  type?: unknown
  event_timestamp?: unknown
  data?: { conversation_id?: unknown; [key: string]: unknown }
  [key: string]: unknown
}

export async function handleElevenLabsWebhook(req: Request, env: Env, requestId: string): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestId)
  const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) return json({ error: 'unsupported_media_type' }, 415, requestId)

  let rawBody: string
  try { ({ rawBody } = await readBodyWithLimit(req, MAX_BODY_BYTES)) } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: 'payload_too_large' }, 413, requestId)
    throw error
  }

  const verification = await verifyElevenLabsSignature(rawBody, req.headers.get('ElevenLabs-Signature'), env.ELEVENLABS_WEBHOOK_SECRET)
  if (!verification.ok) return json({ error: 'forbidden' }, 403, requestId)

  let event: ElevenLabsEvent
  try { event = JSON.parse(rawBody) as ElevenLabsEvent } catch { return json({ error: 'invalid_json' }, 400, requestId) }
  if (typeof event.type !== 'string' || !event.type) return json({ error: 'event_type_required' }, 400, requestId)

  const payloadHash = await sha256Hex(rawBody)
  const eventId = deterministicEventId(event, payloadHash)
  if (!asyncPipelineReady(env)) return json({ error: 'async_pipeline_not_configured', event_id: eventId }, 503, requestId)

  const envelope: CarolineEventEnvelope<ElevenLabsEvent> = {
    schema_version: '1', event_id: eventId, request_id: requestId, environment: env.ENVIRONMENT ?? 'unknown',
    source: 'elevenlabs', source_event_type: event.type,
    source_event_timestamp: typeof event.event_timestamp === 'number' || typeof event.event_timestamp === 'string' ? event.event_timestamp : null,
    received_at: new Date().toISOString(), payload_sha256: payloadHash, payload: event,
  }

  const staged = await stageAndQueueEvent(env, envelope)
  if (!staged.ok) {
    log('warn', 'elevenlabs_enqueue_failed', { request_id: requestId, event_id: eventId, reason: staged.reason })
    return json({ error: staged.reason, event_id: eventId }, 503, requestId)
  }
  return json({ ok: true, queued: true, event_id: eventId, canonical_delivery: 'pending_neon' }, 200, requestId)
}
