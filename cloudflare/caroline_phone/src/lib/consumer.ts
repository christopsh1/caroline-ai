import type { CarolineEventEnvelope, Env, QueuedEventPointer } from '../types.ts'
import { deliverEvent } from './delivery.ts'
import { log } from './log.ts'
import { recordReceipt } from './receipts.ts'
import { sha256Hex } from './security.ts'

function validPointer(value: unknown): value is QueuedEventPointer {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<QueuedEventPointer>
  return p.schema_version === '1'
    && typeof p.event_id === 'string'
    && typeof p.request_id === 'string'
    && typeof p.object_key === 'string'
    && typeof p.envelope_sha256 === 'string'
    && p.source === 'elevenlabs'
}

function validEnvelope(value: unknown, pointer: QueuedEventPointer): value is CarolineEventEnvelope {
  if (!value || typeof value !== 'object') return false
  const e = value as Partial<CarolineEventEnvelope>
  return e.schema_version === '1'
    && e.event_id === pointer.event_id
    && e.source === pointer.source
    && typeof e.payload_sha256 === 'string'
    && typeof e.source_event_type === 'string'
}

export async function consumeEventBatch(batch: MessageBatch<QueuedEventPointer>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const pointer = message.body
    if (!validPointer(pointer)) {
      log('error', 'queue_pointer_invalid')
      message.ack()
      continue
    }

    if (!env.CAROLINE_PAYLOADS) {
      log('error', 'queue_payload_store_missing', { event_id: pointer.event_id })
      message.retry()
      continue
    }

    let object: R2ObjectBody | null
    try { object = await env.CAROLINE_PAYLOADS.get(pointer.object_key) } catch {
      log('warn', 'queue_payload_fetch_failed', { event_id: pointer.event_id })
      message.retry()
      continue
    }

    if (!object) {
      log('error', 'queue_payload_missing', { event_id: pointer.event_id, object_key: pointer.object_key })
      message.retry()
      continue
    }

    let rawEnvelope: string
    try { rawEnvelope = await object.text() } catch {
      log('warn', 'queue_payload_read_failed', { event_id: pointer.event_id })
      message.retry()
      continue
    }

    if ((await sha256Hex(rawEnvelope)) !== pointer.envelope_sha256) {
      log('error', 'queue_payload_integrity_failed', { event_id: pointer.event_id })
      message.retry()
      continue
    }

    let parsed: unknown
    try { parsed = JSON.parse(rawEnvelope) } catch {
      log('error', 'queue_payload_invalid_json', { event_id: pointer.event_id })
      message.retry()
      continue
    }
    if (!validEnvelope(parsed, pointer)) {
      log('error', 'queue_envelope_invalid', { event_id: pointer.event_id })
      message.retry()
      continue
    }

    const delivery = await deliverEvent(env, parsed)
    if (!delivery.ok) {
      log('warn', 'queue_delivery_failed', {
        event_id: pointer.event_id,
        reason: delivery.reason,
        upstream_status: delivery.status ?? null,
      })
      message.retry()
      continue
    }

    try {
      await recordReceipt(env, {
        source: parsed.source,
        event_id: parsed.event_id,
        event_type: parsed.source_event_type,
        event_timestamp: parsed.source_event_timestamp,
        payload_sha256: parsed.payload_sha256,
        request_id: parsed.request_id,
        delivered_at: new Date().toISOString(),
        environment: parsed.environment,
      })
    } catch (error) {
      log('warn', 'receipt_write_failed_after_delivery', {
        event_id: pointer.event_id,
        error_name: error instanceof Error ? error.name : 'unknown',
      })
    }

    try { await env.CAROLINE_PAYLOADS.delete(pointer.object_key) } catch (error) {
      log('warn', 'payload_cleanup_failed_after_delivery', {
        event_id: pointer.event_id,
        error_name: error instanceof Error ? error.name : 'unknown',
      })
    }

    log('info', 'queue_event_delivered', {
      event_id: pointer.event_id,
      event_type: parsed.source_event_type,
      sink_status: delivery.status,
    })
    message.ack()
  }
}
