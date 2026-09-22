import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../src/index.ts'
import { signPayload, verifyPayload } from '../src/security.ts'

class MemoryR2 {
  map = new Map<string, string>()
  async get(key: string) { const v = this.map.get(key); return v === undefined ? null : { text: async () => v } }
  async put(key: string, value: string) { this.map.set(key, value); return {} }
  async delete(key: string) { this.map.delete(key) }
}

const coreKey = 'core-key'
const sinkKey = 'sink-key'

function env() { return { CORE_RUNTIME_KEY: coreKey, EVENT_SINK_KEY: sinkKey, MOCK_STATE: new MemoryR2() as any, ENVIRONMENT: 'development' } }

async function edgeRequest(path: string, operation: string, input: Record<string, unknown>, key = coreKey) {
  const body = JSON.stringify({ schema_version: '1', request_id: 'req-1', environment: 'development', operation, received_at: new Date().toISOString(), input })
  const sig = await signPayload(body, key)
  return new Request(`https://core.test${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Caroline-Signature': sig, 'X-Caroline-Operation': operation, 'X-Caroline-Request-Id': 'req-1',
  }, body })
}

async function readSigned(response: Response, key = coreKey) {
  const raw = await response.text()
  assert.equal(await verifyPayload(raw, response.headers.get('X-Caroline-Signature'), key), true)
  return JSON.parse(raw)
}

test('rejects unsigned core requests', async () => {
  const e = env()
  const response = await worker.fetch(new Request('https://core.test/v1/init', { method: 'POST', body: '{}' }), e as any)
  assert.equal(response.status, 401)
})

test('init creates an owner session and returns a signed response', async () => {
  const e = env()
  const response = await worker.fetch(await edgeRequest('/v1/init', 'init', { conversation_id: 'conv-owner', caller_id: '+15550000001' }), e as any)
  assert.equal(response.status, 200)
  const body = await readSigned(response)
  assert.equal(body.dynamic_variables.caller_identity_status, 'verified_owner')
  assert.equal(body.dynamic_variables.caller_access_tier, 'tier_owner')
  assert.ok([...e.MOCK_STATE.map.keys()].some((key) => key.includes('conv-owner')))
})

test('retrieval authorization is conversation-bound', async () => {
  const e = env()
  await worker.fetch(await edgeRequest('/v1/init', 'init', { conversation_id: 'conv-contact', caller_id: '+15550000002' }), e as any)
  const ok = await worker.fetch(await edgeRequest('/v1/retrieve', 'retrieve', { conversation_id: 'conv-contact', caller_phone: '+19999999999', interaction_mode: 'inbound_external', current_query: 'hello' }), e as any)
  assert.equal((await readSigned(ok)).authorized, true)
  const missing = await worker.fetch(await edgeRequest('/v1/retrieve', 'retrieve', { conversation_id: 'not-seeded', caller_phone: '+15550000002', interaction_mode: 'inbound_external', current_query: 'hello' }), e as any)
  assert.equal((await readSigned(missing)).authorized, false)
})

test('SMS ignores model identity and authorizes only the stored owner session', async () => {
  const e = env()
  await worker.fetch(await edgeRequest('/v1/init', 'init', { conversation_id: 'conv-contact', caller_id: '+15550000002' }), e as any)
  const denied = await worker.fetch(await edgeRequest('/v1/phone/sms', 'phone_sms', { conversation_id: 'conv-contact', to_number: '+15550000999', message_summary: 'hello', owner_phone: '+15550000001' }), e as any)
  assert.equal((await readSigned(denied)).authorized, false)
  await worker.fetch(await edgeRequest('/v1/init', 'init', { conversation_id: 'conv-owner', caller_id: '+15550000001' }), e as any)
  const allowed = await worker.fetch(await edgeRequest('/v1/phone/sms', 'phone_sms', { conversation_id: 'conv-owner', to_number: '+15550000999', message_summary: 'hello' }), e as any)
  const body = await readSigned(allowed)
  assert.equal(body.authorized, true)
  assert.equal(body.disposition, 'queued')
})

test('hold changes server-side session state and blocks subsequent retrieval', async () => {
  const e = env()
  await worker.fetch(await edgeRequest('/v1/init', 'init', { conversation_id: 'conv-contact', caller_id: '+15550000002' }), e as any)
  const held = await worker.fetch(await edgeRequest('/v1/phone/hold', 'phone_hold', { conversation_id: 'conv-contact' }), e as any)
  assert.equal((await readSigned(held)).held, true)
  const retrieve = await worker.fetch(await edgeRequest('/v1/retrieve', 'retrieve', { conversation_id: 'conv-contact', caller_phone: '+15550000002', interaction_mode: 'inbound_external', current_query: 'hello' }), e as any)
  assert.equal((await readSigned(retrieve)).authorized, false)
})

test('event sink uses separate HMAC key and stores metadata receipt only', async () => {
  const e = env()
  const body = JSON.stringify({ schema_version: '1', event_id: 'evt-1', request_id: 'req-e', source: 'elevenlabs', source_event_type: 'post_call_transcription', payload_sha256: 'abc', payload: { transcript: 'secret' } })
  const badSig = await signPayload(body, coreKey)
  const denied = await worker.fetch(new Request('https://core.test/v1/events/elevenlabs', { method: 'POST', headers: { 'X-Caroline-Signature': badSig }, body }), e as any)
  assert.equal(denied.status, 401)
  const sig = await signPayload(body, sinkKey)
  const ok = await worker.fetch(new Request('https://core.test/v1/events/elevenlabs', { method: 'POST', headers: { 'X-Caroline-Signature': sig }, body }), e as any)
  assert.equal(ok.status, 204)
  const stored = [...e.MOCK_STATE.map.values()].find((v) => v.includes('evt-1')) ?? ''
  assert.equal(stored.includes('secret'), false)
  assert.equal(stored.includes('payload_sha256'), true)
})
