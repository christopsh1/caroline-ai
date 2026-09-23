import type { CarolineEventEnvelope, Env, QueuedEventPointer } from '../types.ts'
import { deliverCanonicalEvent } from './canonical.ts'
import { log } from './log.ts'
import { recordReceiptCache } from './receipts.ts'
import { sha256Hex } from './security.ts'

function validPointer(value: unknown): value is QueuedEventPointer {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<QueuedEventPointer>
  return p.schema_version === '1' && typeof p.event_id === 'string' && typeof p.request_id === 'string'
    && typeof p.object_key === 'string' && typeof p.envelope_sha256 === 'string' && p.source === 'elevenlabs'
}

function validEnvelope(value: unknown, pointer: QueuedEventPointer): value is CarolineEventEnvelope {
  if (!value || typeof value !== 'object') return false
  const e = value as Partial<CarolineEventEnvelope>
  return e.schema_version === '1' && e.event_id === pointer.event_id && e.source === pointer.source
    && typeof e.payload_sha256 === 'string' && typeof e.source_event_type === 'string'
}

export async function consumeEventBatch(batch: MessageBatch<QueuedEventPointer>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const pointer = message.body
    if (!validPointer(pointer)) { log('error', 'queue_pointer_invalid'); message.ack(); continue }
    if (!env.CAROLINE_EVENTS_RAW) { log('error', 'queue_payload_store_missing', { event_id: pointer.event_id }); message.retry(); continue }

    let object: R2ObjectBody | null
    try { object = await env.CAROLINE_EVENTS_RAW.get(pointer.object_key) } catch { message.retry(); continue }
    if (!object) { log('error', 'queue_payload_missing', { event_id: pointer.event_id }); message.retry(); continue }

    let rawEnvelope: string
    try { rawEnvelope = await object.text() } catch { message.retry(); continue }
    if ((await sha256Hex(rawEnvelope)) !== pointer.envelope_sha256) { log('error', 'queue_payload_integrity_failed', { event_id: pointer.event_id }); message.retry(); continue }

    let parsed: unknown
    try { parsed = JSON.parse(rawEnvelope) } catch { message.retry(); continue }
    if (!validEnvelope(parsed, pointer)) { message.retry(); continue }

    const delivery = await deliverCanonicalEvent(env, parsed)
    if (delivery.status !== 'ready') {
      log('info', 'canonical_event_delivery_pending_neon', { event_id: pointer.event_id })
      message.retry()
      continue
    }

    try {
      await recordReceiptCache(env, {
        source: parsed.source, event_id: parsed.event_id, event_type: parsed.source_event_type,
        event_timestamp: parsed.source_event_timestamp, payload_sha256: parsed.payload_sha256,
        request_id: parsed.request_id, delivered_at: new Date().toISOString(), environment: parsed.environment,
      })
    } catch {}
    try { await env.CAROLINE_EVENTS_RAW.delete(pointer.object_key) } catch {}
    message.ack()
  }
}
