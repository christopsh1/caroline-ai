import assert from 'node:assert/strict'
import test from 'node:test'
import { stageAndQueueEvent } from '../src/lib/staging.ts'
import type { CarolineEventEnvelope, QueuedEventPointer } from '../src/types.ts'

class MemoryR2 {
  objects = new Map<string, string>()
  async put(key: string, value: string) { this.objects.set(key, value) }
  async get(key: string) { const value = this.objects.get(key); return value === undefined ? null : { text: async () => value } }
  async delete(key: string) { this.objects.delete(key) }
}

class MemoryQueue {
  messages: QueuedEventPointer[] = []
  async send(body: QueuedEventPointer) { this.messages.push(body) }
}

const envelope: CarolineEventEnvelope = {
  schema_version: '1', event_id: 'evt-1', request_id: 'req-1', environment: 'development', source: 'elevenlabs',
  source_event_type: 'post_call_transcription', source_event_timestamp: 1, received_at: '2026-09-21T00:00:00.000Z',
  payload_sha256: 'abc', payload: { hello: 'world' },
}

test('stages full envelope in R2 and queues only a pointer', async () => {
  const r2 = new MemoryR2()
  const queue = new MemoryQueue()
  const result = await stageAndQueueEvent({ CAROLINE_EVENTS_RAW: r2 as any, EVENT_DELIVERY: queue as any }, envelope)
  assert.equal(result.ok, true)
  assert.equal(queue.messages.length, 1)
  const pointer = queue.messages[0]
  assert.equal(pointer.event_id, 'evt-1')
  assert.equal('payload' in (pointer as any), false)
  assert.equal(r2.objects.has(pointer.object_key), true)
})

test('removes staged object when queue send fails', async () => {
  const r2 = new MemoryR2()
  const queue = { send: async () => { throw new Error('queue down') } }
  const result = await stageAndQueueEvent({ CAROLINE_EVENTS_RAW: r2 as any, EVENT_DELIVERY: queue as any }, envelope)
  assert.deepEqual(result, { ok: false, reason: 'queue_send_failed' })
  assert.equal(r2.objects.size, 0)
})
