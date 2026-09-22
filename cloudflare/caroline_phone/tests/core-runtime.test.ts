import assert from 'node:assert/strict'
import test from 'node:test'
import { callCoreRuntime } from '../src/lib/core-runtime.ts'
import { signCarolinePayload } from '../src/lib/security.ts'

const key = 'core-test-key'

async function signedResponse(body: unknown, status = 200): Promise<Response> {
  const raw = JSON.stringify(body)
  const now = Math.floor(Date.now() / 1000)
  const signature = await signCarolinePayload(raw, key, now)
  return new Response(raw, { status, headers: { 'Content-Type': 'application/json', 'X-Caroline-Signature': signature } })
}

test('core runtime call signs request and requires a signed response', async () => {
  const originalFetch = globalThis.fetch
  let sawSignature = false
  ;(globalThis as any).fetch = async (_url: URL, init: RequestInit) => {
    const headers = new Headers(init.headers)
    sawSignature = /^t=\d+,v1=[a-f0-9]{64}$/.test(headers.get('X-Caroline-Signature') ?? '')
    assert.equal(headers.get('X-Caroline-Operation'), 'init')
    return signedResponse({ schema_version: '1', dynamic_variables: {} })
  }
  try {
    const result = await callCoreRuntime({ CORE_RUNTIME_URL: 'https://core.example.test', CORE_RUNTIME_KEY: key }, 'init', { conversation_id: 'c1' }, 'r1', 1024)
    assert.equal(result.ok, true)
    assert.equal(sawSignature, true)
  } finally {
    ;(globalThis as any).fetch = originalFetch
  }
})

test('core runtime rejects unsigned successful responses', async () => {
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => new Response('{"schema_version":"1"}', { status: 200 })
  try {
    const result = await callCoreRuntime({ CORE_RUNTIME_URL: 'https://core.example.test', CORE_RUNTIME_KEY: key }, 'retrieve', {}, 'r2', 1024)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'core_response_signature_invalid')
  } finally {
    ;(globalThis as any).fetch = originalFetch
  }
})

test('core runtime refuses non-HTTPS upstreams', async () => {
  const result = await callCoreRuntime({ CORE_RUNTIME_URL: 'http://core.example.test', CORE_RUNTIME_KEY: key }, 'retrieve', {}, 'r3', 1024)
  assert.deepEqual(result, { ok: false, reason: 'core_url_invalid' })
})
