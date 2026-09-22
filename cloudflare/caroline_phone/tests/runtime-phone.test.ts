import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRuntimePhoneAction } from '../src/handlers/runtime-phone.ts'
import { signCarolinePayload } from '../src/lib/security.ts'

const runtimeKey = 'edge-runtime-key'
const coreKey = 'core-runtime-key'

async function signedCore(body: unknown, status = 200): Promise<Response> {
  const raw = JSON.stringify(body)
  const ts = Math.floor(Date.now() / 1000)
  const sig = await signCarolinePayload(raw, coreKey, ts)
  return new Response(raw, { status, headers: { 'X-Caroline-Signature': sig } })
}

function env() {
  return { CAROLINE_RUNTIME_KEY: runtimeKey, CORE_RUNTIME_URL: 'https://core.example.test', CORE_RUNTIME_KEY: coreKey }
}

function req(path: string, body: unknown, key = runtimeKey): Request {
  return new Request(`https://edge.test/runtime/phone/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-caroline-key': key },
    body: JSON.stringify(body),
  })
}

test('phone actions require edge auth and conversation binding input', async () => {
  const unauthorized = await handleRuntimePhoneAction(req('hold', { conversation_id: 'c1' }, 'wrong'), env(), 'r1', 'hold')
  assert.equal(unauthorized.status, 401)

  const missingConversation = await handleRuntimePhoneAction(req('hold', { reason_code: 'abuse' }), env(), 'r2', 'hold')
  assert.equal(missingConversation.status, 400)
})

test('contact resolve sends conversation id to core and strips internal fields', async () => {
  const originalFetch = globalThis.fetch
  let outbound: any
  ;(globalThis as any).fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    outbound = JSON.parse(String(init?.body))
    return signedCore({
      schema_version: '1',
      authorized: true,
      unique: true,
      candidates: [{ display_name: 'Nicole', phone: '+15550000001', contact_ref: 'opaque-1', internal_id: 'db-uuid' }],
      debug: 'secret',
    })
  }
  try {
    const response = await handleRuntimePhoneAction(req('contact-resolve', { conversation_id: 'conv-1', name: 'Nicole', owner_phone: '+1999' }), env(), 'r3', 'contact-resolve')
    assert.equal(response.status, 200)
    assert.equal(outbound.input.conversation_id, 'conv-1')
    assert.equal(outbound.input.owner_phone, undefined)
    const body = await response.json() as any
    assert.deepEqual(body, { authorized: true, unique: true, candidates: [{ display_name: 'Nicole', phone: '+15550000001', contact_ref: 'opaque-1' }] })
  } finally { ;(globalThis as any).fetch = originalFetch }
})

test('unauthorized SMS can never echo sent state', async () => {
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => signedCore({ schema_version: '1', authorized: false, accepted: true, disposition: 'sent', provider_id: 'leak' })
  try {
    const response = await handleRuntimePhoneAction(req('sms', { conversation_id: 'conv-1', to_number: '+15550000002', message_summary: 'Hello' }), env(), 'r4', 'sms')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { authorized: false, accepted: false, disposition: 'rejected' })
  } finally { ;(globalThis as any).fetch = originalFetch }
})

test('authorized SMS exposes only accepted disposition and schedule time', async () => {
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => signedCore({
    schema_version: '1', authorized: true, accepted: true, disposition: 'scheduled', execute_at: '2026-09-23T09:00:00-04:00', provider_id: 'private',
  })
  try {
    const response = await handleRuntimePhoneAction(req('sms', { conversation_id: 'conv-1', to_number: '+15550000002', message_summary: 'Hello' }), env(), 'r5', 'sms')
    assert.deepEqual(await response.json(), { authorized: true, accepted: true, disposition: 'scheduled', execute_at: '2026-09-23T09:00:00-04:00' })
  } finally { ;(globalThis as any).fetch = originalFetch }
})

test('calendar sanitizer enforces busy-only field discipline at the edge', async () => {
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => signedCore({
    schema_version: '1', authorized: true, share_level: 'busy_only', events: [{
      start_at: '2026-09-23T09:00:00-04:00', end_at: '2026-09-23T10:00:00-04:00', status: 'busy', title: 'Private meeting', description: 'secret', location: 'secret place',
    }],
  })
  try {
    const response = await handleRuntimePhoneAction(req('calendar-read', { conversation_id: 'conv-1' }), env(), 'r6', 'calendar-read')
    assert.deepEqual(await response.json(), {
      authorized: true,
      share_level: 'busy_only',
      events: [{ start_at: '2026-09-23T09:00:00-04:00', end_at: '2026-09-23T10:00:00-04:00', status: 'busy' }],
    })
  } finally { ;(globalThis as any).fetch = originalFetch }
})

test('unauthorized hold can never echo held state', async () => {
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => signedCore({ schema_version: '1', authorized: false, held: true, state: 'active' })
  try {
    const response = await handleRuntimePhoneAction(req('hold', { conversation_id: 'conv-1', reason_code: 'abuse' }), env(), 'r7', 'hold')
    assert.deepEqual(await response.json(), { authorized: false, held: false, state: 'rejected' })
  } finally { ;(globalThis as any).fetch = originalFetch }
})

test('re-entry acknowledgement is fail closed and only returns bounded message', async () => {
  const originalFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => signedCore({ schema_version: '1', authorized: true, acknowledged: true, message: 'Prior issue noted. We can continue.', internal: 'hide' })
  try {
    const response = await handleRuntimePhoneAction(req('reentry-ack', { conversation_id: 'conv-1', caller_phone: '+1999' }), env(), 'r8', 'reentry-ack')
    assert.deepEqual(await response.json(), { authorized: true, acknowledged: true, message: 'Prior issue noted. We can continue.' })
  } finally { ;(globalThis as any).fetch = originalFetch }
})
