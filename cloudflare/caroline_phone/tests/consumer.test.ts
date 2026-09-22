import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeEventBatch } from '../src/lib/consumer.ts'
import { sha256Hex } from '../src/lib/security.ts'
import type { CarolineEventEnvelope, QueuedEventPointer } from '../src/types.ts'

class MemoryR2 {
  objects = new Map<string, string>()
  async put(key: string, value: string) { this.objects.set(key, value) }
  async get(key: string) { const value = this.objects.get(key); return value === undefined ? null : { text: async () => value } }
  async delete(key: string) { this.objects.delete(key) }
}

function fakeMessage(body: QueuedEventPointer) {
  return { body, acked: false, retried: false, ack() { this.acked = true }, retry() { this.retried = true } }
}

test('consumer retries when staged payload integrity fails', async () => {
  const r2 = new MemoryR2()
  const pointer: QueuedEventPointer = { schema_version: '1', event_id: 'evt-1', request_id: 'req-1', environment: 'development', source: 'elevenlabs', source_event_type: 'post_call_transcription', received_at: new Date().toISOString(), object_key: 'x', envelope_sha256: 'bad' }
  r2.objects.set('x', '{}')
  const message = fakeMessage(pointer)
  await consumeEventBatch({ messages: [message] } as any, { CAROLINE_PAYLOADS: r2 as any })
  assert.equal(message.retried, true)
  assert.equal(message.acked, false)
})

test('consumer retries when sink is not configured', async () => {
  const r2 = new MemoryR2()
  const envelope: CarolineEventEnvelope = { schema_version: '1', event_id: 'evt-2', request_id: 'req-2', environment: 'development', source: 'elevenlabs', source_event_type: 'post_call_transcription', source_event_timestamp: 1, received_at: new Date().toISOString(), payload_sha256: 'abc', payload: {} }
  const raw = JSON.stringify(envelope)
  const pointer: QueuedEventPointer = { schema_version: '1', event_id: envelope.event_id, request_id: envelope.request_id, environment: envelope.environment, source: envelope.source, source_event_type: envelope.source_event_type, received_at: envelope.received_at, object_key: 'x', envelope_sha256: await sha256Hex(raw) }
  r2.objects.set('x', raw)
  const message = fakeMessage(pointer)
  await consumeEventBatch({ messages: [message] } as any, { CAROLINE_PAYLOADS: r2 as any })
  assert.equal(message.retried, true)
  assert.equal(message.acked, false)
  assert.equal(r2.objects.has('x'), true)
})

test('consumer acknowledges, records receipt, and deletes payload after confirmed delivery', async () => {
  const r2 = new MemoryR2()
  const receipts = new Map<string, string>()
  const kv = { async get(key: string) { return receipts.get(key) ?? null }, async put(key: string, value: string) { receipts.set(key, value) } }
  const envelope: CarolineEventEnvelope = { schema_version: '1', event_id: 'evt-3', request_id: 'req-3', environment: 'development', source: 'elevenlabs', source_event_type: 'post_call_transcription', source_event_timestamp: 1, received_at: new Date().toISOString(), payload_sha256: 'abc', payload: { ok: true } }
  const raw = JSON.stringify(envelope)
  const pointer: QueuedEventPointer = { schema_version: '1', event_id: envelope.event_id, request_id: envelope.request_id, environment: envelope.environment, source: envelope.source, source_event_type: envelope.source_event_type, received_at: envelope.received_at, object_key: 'success', envelope_sha256: await sha256Hex(raw) }
  r2.objects.set('success', raw)
  const message = fakeMessage(pointer)
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => new Response(null, { status: 204 })
  try {
    await consumeEventBatch({ messages: [message] } as any, { ENVIRONMENT: 'development', CAROLINE_PAYLOADS: r2 as any, CAROLINE_PHONE: kv as any, EVENT_SINK_URL: 'https://sink.example.test/events', EVENT_SINK_KEY: 'sink-secret' })
  } finally {
    ;(globalThis as any).fetch = originalFetch
  }
  assert.equal(message.acked, true)
  assert.equal(message.retried, false)
  assert.equal(r2.objects.has('success'), false)
  assert.equal(receipts.size, 1)
})
