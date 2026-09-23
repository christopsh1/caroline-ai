import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRuntimeInit } from '../src/handlers/runtime-init.ts'
import type { CarolineSessionState } from '../src/lib/session-model.ts'

function fakeSessionNamespace() {
  let stored: CarolineSessionState | null = null
  return {
    namespace: {
      getByName() {
        return {
          async fetch(req: Request) {
            if (req.method === 'PUT') {
              stored = await req.json() as CarolineSessionState
              return new Response(JSON.stringify(stored), { status: 200, headers: { 'Content-Type':'application/json' } })
            }
            if (req.method === 'GET' && stored) return new Response(JSON.stringify(stored), { status: 200 })
            return new Response('{}', { status: 404 })
          },
        }
      },
    },
    read: () => stored,
  }
}

test('runtime init authenticates before parsing and returns generic 403', async () => {
  const req = new Request('https://edge.test/runtime/init', { method:'POST', headers:{'Content-Type':'application/json'}, body:'not-json' })
  const response = await handleRuntimeInit(req, { CAROLINE_KEY:'secret' }, 'r1')
  assert.equal(response.status, 403)
})

test('runtime init persists fail-closed session state in Durable Object before returning', async () => {
  const fake = fakeSessionNamespace()
  const req = new Request('https://edge.test/runtime/init', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-caroline-key':'secret'},
    body:JSON.stringify({ conversation_id:'conv-1', caller_id:'caller-real-binding', interaction_mode:'inbound_external' }),
  })
  const response = await handleRuntimeInit(req, { CAROLINE_KEY:'secret', CAROLINE_SESSIONS: fake.namespace as any, PHONE_TOOL_POLICY_JSON:'{"owner":[],"external":[],"unknown":[],"outbound":[],"hold":[],"calendar_read":[],"reentry":[]}' }, 'r2')
  assert.equal(response.status, 200)
  const body = await response.json() as any
  assert.equal(body.dynamic_variables.call_answering_status, 'canonical_pending')
  assert.deepEqual(body.conversation_config_override.agent.prompt.tool_ids, [])
  const stored = fake.read() as CarolineSessionState | null
  assert.ok(stored)
  assert.equal(stored?.conversation_id, 'conv-1')
  assert.ok(stored?.caller_binding_hash)
  assert.equal(JSON.stringify(stored).includes('caller-real-binding'), false)
  assert.equal(stored?.canonical.caller_profile, 'pending_neon')
})

test('runtime init refuses to operate without durable session binding', async () => {
  const req = new Request('https://edge.test/runtime/init', { method:'POST', headers:{'Content-Type':'application/json','x-caroline-key':'secret'}, body:'{"conversation_id":"c"}' })
  const response = await handleRuntimeInit(req, { CAROLINE_KEY:'secret' }, 'r3')
  assert.equal(response.status, 503)
  assert.equal((await response.json() as any).error, 'session_store_unavailable')
})
