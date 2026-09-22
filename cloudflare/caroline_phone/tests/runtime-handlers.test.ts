import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRuntimeInit } from '../src/handlers/runtime-init.ts'
import { handleRuntimeRetrieve } from '../src/handlers/runtime-retrieve.ts'
import { signCarolinePayload } from '../src/lib/security.ts'

const runtimeKey = 'edge-runtime-key'
const coreKey = 'core-runtime-key'

async function coreResponse(body: unknown): Promise<Response> {
  const raw = JSON.stringify(body)
  const ts = Math.floor(Date.now() / 1000)
  const sig = await signCarolinePayload(raw, coreKey, ts)
  return new Response(raw, { status: 200, headers: { 'X-Caroline-Signature': sig } })
}

test('runtime init rejects requests without the edge runtime key', async () => {
  const req = new Request('https://edge.test/runtime/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"conversation_id":"c1"}' })
  const response = await handleRuntimeInit(req, { CAROLINE_RUNTIME_KEY: runtimeKey }, 'req-1')
  assert.equal(response.status, 401)
})

test('runtime init maps signed core context into exact ElevenLabs client-data shape', async () => {
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => coreResponse({
    schema_version: '1',
    dynamic_variables: { caller_identity_status: 'verified_contact', caller_access_tier: 'tier_2', bio_short: 'allowed' },
  })
  try {
    const req = new Request('https://edge.test/runtime/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-caroline-key': runtimeKey },
      body: JSON.stringify({ caller_id: 'caller-fixture', conversation_id: 'c1' }),
    })
    const response = await handleRuntimeInit(req, {
      CAROLINE_RUNTIME_KEY: runtimeKey,
      CORE_RUNTIME_URL: 'https://core.example.test',
      CORE_RUNTIME_KEY: coreKey,
      PHONE_TOOL_POLICY_JSON: JSON.stringify({ owner: ['owner'], external: ['retrieve-external'], unknown: [] }),
    }, 'req-2')
    assert.equal(response.status, 200)
    const body = await response.json() as any
    assert.equal(body.type, 'conversation_initiation_client_data')
    assert.equal(body.dynamic_variables.bio_short, 'allowed')
    assert.deepEqual(body.conversation_config_override.agent.prompt.tool_ids, ['retrieve-external'])
  } finally {
    ;(globalThis as any).fetch = originalFetch
  }
})

test('runtime retrieval returns a sanitized authorized envelope', async () => {
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => coreResponse({
    schema_version: '1',
    authorized: true,
    context: 'Relevant context',
    secret_debug: 'must-not-pass',
    results: [{ type: 'memory', text: 'Remembered fact', internal_id: 'private-id' }],
  })
  try {
    const req = new Request('https://edge.test/runtime/retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-caroline-key': runtimeKey },
      body: JSON.stringify({ conversation_id: 'c1', caller_phone: 'caller-fixture', interaction_mode: 'inbound_external', current_query: 'What did we discuss?' }),
    })
    const response = await handleRuntimeRetrieve(req, {
      CAROLINE_RUNTIME_KEY: runtimeKey,
      CORE_RUNTIME_URL: 'https://core.example.test',
      CORE_RUNTIME_KEY: coreKey,
    }, 'req-3')
    assert.equal(response.status, 200)
    const body = await response.json() as any
    assert.equal(body.authorized, true)
    assert.equal(body.context, 'Relevant context')
    assert.equal(body.secret_debug, undefined)
    assert.deepEqual(body.results, [{ type: 'memory', text: 'Remembered fact' }])
  } finally {
    ;(globalThis as any).fetch = originalFetch
  }
})

test('runtime retrieval requires conversation_id for conversation-bound authorization', async () => {
  const req = new Request('https://edge.test/runtime/retrieve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-caroline-key': runtimeKey },
    body: JSON.stringify({ caller_phone: 'caller-fixture', interaction_mode: 'inbound_external', current_query: 'What did we discuss?' }),
  })
  const response = await handleRuntimeRetrieve(req, {
    CAROLINE_RUNTIME_KEY: runtimeKey,
    CORE_RUNTIME_URL: 'https://core.example.test',
    CORE_RUNTIME_KEY: coreKey,
  }, 'req-4')
  assert.equal(response.status, 400)
})
