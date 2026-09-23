import type { CarolineEventEnvelope, Env, QueuedEventPointer } from '../types.ts'
import { sha256Hex } from './security.ts'

export type StageResult =
  | { ok: true; pointer: QueuedEventPointer }
  | { ok: false; reason: 'payload_store_not_configured' | 'queue_not_configured' | 'payload_store_failed' | 'queue_send_failed' }

export function asyncPipelineReady(env: Env): boolean {
  return Boolean(env.CAROLINE_EVENTS_RAW && env.EVENT_DELIVERY)
}

export async function stageAndQueueEvent(env: Env, envelope: CarolineEventEnvelope): Promise<StageResult> {
  if (!env.CAROLINE_EVENTS_RAW) return { ok: false, reason: 'payload_store_not_configured' }
  if (!env.EVENT_DELIVERY) return { ok: false, reason: 'queue_not_configured' }

  const body = JSON.stringify(envelope)
  const envelopeHash = await sha256Hex(body)
  const environment = envelope.environment || 'unknown'
  const datePrefix = envelope.received_at.slice(0, 10)
  const objectKey = `events/${environment}/${datePrefix}/${envelopeHash}.json`

  try {
    await env.CAROLINE_EVENTS_RAW.put(objectKey, body, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        event_id: envelope.event_id,
        source: envelope.source,
        event_type: envelope.source_event_type,
        payload_sha256: envelope.payload_sha256,
      },
    })
  } catch {
    return { ok: false, reason: 'payload_store_failed' }
  }

  const pointer: QueuedEventPointer = {
    schema_version: '1',
    event_id: envelope.event_id,
    request_id: envelope.request_id,
    environment,
    source: envelope.source,
    source_event_type: envelope.source_event_type,
    received_at: envelope.received_at,
    object_key: objectKey,
    envelope_sha256: envelopeHash,
  }

  try {
    await env.EVENT_DELIVERY.send(pointer)
  } catch {
    try { await env.CAROLINE_EVENTS_RAW.delete(objectKey) } catch { /* cleanup best effort */ }
    return { ok: false, reason: 'queue_send_failed' }
  }

  return { ok: true, pointer }
}
