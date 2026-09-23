import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRuntimePhoneAction } from '../src/handlers/runtime-phone.ts'
import { applyCurrentSessionHold, createPendingNeonSession, type CarolineSessionState } from '../src/lib/session-model.ts'

function namespaceFor(initial: CarolineSessionState) {
  let state = initial
  return {
    getByName() {
      return {
        async fetch(req: Request) {
          const url = new URL(req.url)
          if (req.method === 'GET') return new Response(JSON.stringify(state), { status: 200 })
          if (url.pathname.endsWith('/hold') && req.method === 'POST') {
            const body = await req.json() as any
            const updated = applyCurrentSessionHold(state, body.reason_code, body.reason_summary)
            if (!updated) return new Response('{"error":"forbidden"}', { status: 403 })
            state = updated
            return new Response(JSON.stringify(state), { status: 200 })
          }
          return new Response('{}', { status: 404 })
        },
      }
    },
  }
}

function request(path: string, body: unknown) {
  return new Request(`https://edge.test/runtime/phone/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-caroline-key': 'secret' },
    body: JSON.stringify(body),
  })
}

test('blocked/pending session cannot invoke phone actions even with valid runtime credential', async () => {
  const session = createPendingNeonSession({ conversation_id: 'c1', interaction_mode: 'inbound_external' })
  const res = await handleRuntimePhoneAction(request('sms', { conversation_id: 'c1', to_number: '+10000000000', message_summary: 'x' }), { CAROLINE_KEY: 'secret', CAROLINE_SESSIONS: namespaceFor(session) as any }, 'r1', 'sms')
  assert.equal(res.status, 403)
})

test('current-session hold is written through the Durable Object and does not claim cross-call persistence', async () => {
  const base = createPendingNeonSession({ conversation_id: 'c2', interaction_mode: 'inbound_external' })
  const session: CarolineSessionState = {
    ...base,
    role: 'external',
    identity_status: 'verified_contact',
    call_answering_status: 'allowed',
    permission_snapshot: { ...base.permission_snapshot, can_hold_current_session: true },
  }
  const res = await handleRuntimePhoneAction(request('hold', { conversation_id: 'c2', reason_code: 'abuse' }), { CAROLINE_KEY: 'secret', CAROLINE_SESSIONS: namespaceFor(session) as any }, 'r2', 'hold')
  assert.equal(res.status, 200)
  const body = await res.json() as any
  assert.equal(body.state, 'session_hold_active')
  assert.equal(body.scope, 'current_session')
  assert.equal(body.canonical_persistence, 'pending_neon')
})
