import assert from 'node:assert/strict'
import test from 'node:test'
import { hmacSha256Hex, signCarolinePayload, verifyElevenLabsSignature } from '../src/lib/security.ts'

const secret = 'test_secret_do_not_use_in_production'
const rawBody = JSON.stringify({ type: 'post_call_transcription', event_timestamp: 1, data: { conversation_id: 'conv_123' } })

test('accepts a valid ElevenLabs HMAC signature', async () => {
  const now = 1_800_000_000
  const digest = await hmacSha256Hex(secret, `${now}.${rawBody}`)
  const result = await verifyElevenLabsSignature(rawBody, `t=${now},v0=${digest}`, secret, now)
  assert.deepEqual(result, { ok: true })
})

test('rejects an invalid ElevenLabs HMAC signature', async () => {
  const now = 1_800_000_000
  const result = await verifyElevenLabsSignature(rawBody, `t=${now},v0=${'0'.repeat(64)}`, secret, now)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'invalid_signature')
})

test('rejects stale ElevenLabs signatures', async () => {
  const now = 1_800_000_000
  const signedAt = now - 1801
  const digest = await hmacSha256Hex(secret, `${signedAt}.${rawBody}`)
  const result = await verifyElevenLabsSignature(rawBody, `t=${signedAt},v0=${digest}`, secret, now)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'stale_signature')
})

test('creates a Caroline downstream HMAC header', async () => {
  const result = await signCarolinePayload('{"hello":"world"}', secret, 123)
  assert.match(result, /^t=123,v1=[a-f0-9]{64}$/)
})

test('verifies Caroline v1 signatures used between edge and core', async () => {
  const { verifyCarolinePayloadSignature } = await import('../src/lib/security.ts')
  const now = 1_800_000_000
  const body = '{"ok":true}'
  const header = await signCarolinePayload(body, secret, now)
  assert.deepEqual(await verifyCarolinePayloadSignature(body, header, secret, now, 300), { ok: true })
})

test('rejects stale Caroline edge/core signatures', async () => {
  const { verifyCarolinePayloadSignature } = await import('../src/lib/security.ts')
  const now = 1_800_000_000
  const body = '{"ok":true}'
  const header = await signCarolinePayload(body, secret, now - 301)
  const result = await verifyCarolinePayloadSignature(body, header, secret, now, 300)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'stale_signature')
})
