import assert from 'node:assert/strict'
import test from 'node:test'
import worker, { type Env } from '../src/index'
import { expectedTwilioSignature } from '../src/twilio-security'

const TWILIO_TOKEN = '12345'
const TOOL_SECRET = 'tool-secret'
const WEBHOOK_SECRET = 'webhook-secret'
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://example.invalid" /></Connect></Response>'

function makeStateBinding() {
  const states = new Map<string, any>()
  const binding = {
    idFromName(name: string) { return name },
    get(id: unknown) {
      const key = String(id)
      return {
        async fetch(_input: RequestInfo | URL, init?: RequestInit) {
          const method = init?.method ?? 'GET'
          if (method === 'GET') return Response.json(states.get(key) ?? null)
          if (method === 'PATCH') {
            const patch = JSON.parse(String(init?.body ?? '{}'))
            const now = new Date().toISOString()
            const next = {
              ...(states.get(key) ?? {}),
              ...patch,
              created_at: states.get(key)?.created_at ?? patch.created_at ?? now,
              updated_at: now,
            }
            states.set(key, next)
            return Response.json(next)
          }
          return new Response('method_not_allowed', { status: 405 })
        },
      }
    },
  }
  return { binding, states }
}

function makeEventLedger() {
  const claims = new Map<string, boolean>()
  return {
    binding: {
      idFromName(name: string) { return name },
      get(id: unknown) {
        const key = String(id)
        return {
          async fetch(input: RequestInfo | URL, init?: RequestInit) {
            const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url).pathname
            if (init?.method !== 'POST') return new Response('method_not_allowed', { status: 405 })
            if (path === '/release') {
              claims.set(key, false)
              return Response.json({ ok: true, released: true })
            }
            const duplicate = claims.get(key) === true
            if (!duplicate) claims.set(key, true)
            return Response.json({ ok: true, duplicate })
          },
        }
      },
    },
    claims,
  }
}

function makeQueue() {
  const messages: any[] = []
  return {
    messages,
    binding: { async send(message: unknown) { messages.push(message) } },
  }
}

function makeEnv(callBinding: ReturnType<typeof makeStateBinding>['binding']): Env {
  return {
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: TWILIO_TOKEN,
    TWILIO_FROM_NUMBER: '+15550000002',
    OUTBOUND_ADMIN_TOKEN: 'admin-secret',
    ELEVENLABS_API_KEY: 'test-elevenlabs-key',
    ELEVENLABS_TOOL_SECRET: TOOL_SECRET,
    ELEVENLABS_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ACTION_CONFIRMATION_SECRET: 'confirmation-secret',
    CAROLINE_BACKEND_URL: 'https://backend.example',
    CAROLINE_BACKEND_TOKEN: 'backend-secret',
    CAROLINE_PHONE_PUBLIC_URL: 'https://phone.example',
    ELEVENLABS_INBOUND_AGENT_ID: 'agent_inbound',
    ELEVENLABS_OUTBOUND_AGENT_ID: 'agent_outbound',
    CALL_SESSION: callBinding,
  }
}

async function signedTwilioRequest(url: string, values: Record<string, string>): Promise<Request> {
  const params = new URLSearchParams(values)
  const signature = await expectedTwilioSignature(TWILIO_TOKEN, url, params)
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature },
    body: params.toString(),
  })
}

async function elevenLabsSignature(rawBody: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)))
  const digest = Array.from(signed, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `t=${timestamp},v0=${digest}`
}

test('matches Twilio official HMAC-SHA1 form vector', async () => {
  const signature = await expectedTwilioSignature(TWILIO_TOKEN, 'https://example.com/myapp.php?foo=1&bar=2', {
    CallSid: 'CA1234567890ABCDE', Caller: '+14158675310', Digits: '1234', From: '+14158675310', To: '+18005551212',
  })
  assert.equal(signature, 'L/OH5YylLD5NRKLltdqwSvS0BnU=')
})

test('rejects unsigned Twilio requests before state or ElevenLabs work', async () => {
  const store = makeStateBinding()
  const request = new Request('https://phone.example/twilio/inbound', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'CallSid=CA1&From=%2B15550000001&To=%2B15550000002',
  })
  const response = await worker.fetch(request, makeEnv(store.binding))
  assert.equal(response.status, 403)
  assert.equal(store.states.size, 0)
})

test('inbound returns ElevenLabs-produced TwiML, uses native agent registration, and passes only call_context_id', async () => {
  const store = makeStateBinding()
  const previousFetch = globalThis.fetch
  const registerBodies: any[] = []
  const upstreamUrls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    upstreamUrls.push(url)
    registerBodies.push(JSON.parse(String(init?.body ?? '{}')))
    return new Response(TWIML, { status: 200 })
  }) as typeof fetch

  try {
    for (let i = 0; i < 2; i += 1) {
      const request = await signedTwilioRequest('https://phone.example/twilio/inbound', {
        CallSid: 'CA_INBOUND', From: '+15550000001', To: '+15550000002',
      })
      const response = await worker.fetch(request, makeEnv(store.binding))
      assert.equal(response.status, 200)
      assert.equal(await response.text(), TWIML)
    }
    assert.equal(registerBodies[0].agent_id, 'agent_inbound')
    assert.equal(registerBodies[0].direction, 'inbound')
    assert.equal('branch_id' in registerBodies[0].conversation_initiation_client_data, false)
    const firstVars = registerBodies[0].conversation_initiation_client_data.dynamic_variables
    const secondVars = registerBodies[1].conversation_initiation_client_data.dynamic_variables
    assert.deepEqual(Object.keys(firstVars), ['call_context_id'])
    assert.equal(firstVars.call_context_id, secondVars.call_context_id)
    assert.ok(store.states.has(firstVars.call_context_id))
    assert.deepEqual(upstreamUrls, [
      'https://api.elevenlabs.io/v1/convai/twilio/register-call',
      'https://api.elevenlabs.io/v1/convai/twilio/register-call',
    ])
  } finally { globalThis.fetch = previousFetch }
})

test('outbound signed Twilio leg uses the dedicated ElevenLabs outbound agent', async () => {
  const store = makeStateBinding()
  const previousFetch = globalThis.fetch
  let registerBody: any = null
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    registerBody = JSON.parse(String(init?.body ?? '{}'))
    return new Response(TWIML, { status: 200 })
  }) as typeof fetch
  try {
    const request = await signedTwilioRequest('https://phone.example/twilio/outbound', {
      CallSid: 'CA_OUTBOUND', From: '+15550000002', To: '+15550000003',
    })
    assert.equal((await worker.fetch(request, makeEnv(store.binding))).status, 200)
    assert.equal(registerBody.agent_id, 'agent_outbound')
    assert.equal(registerBody.direction, 'outbound')
  } finally { globalThis.fetch = previousFetch }
})

test('authorized outbound admin trigger creates a Twilio call with AMD and Cloudflare callback', async () => {
  const store = makeStateBinding()
  const previousFetch = globalThis.fetch
  let twilioBody = ''
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    assert.match(url, /api\.twilio\.com\/2010-04-01\/Accounts\/AC123\/Calls\.json/)
    twilioBody = String(init?.body ?? '')
    return Response.json({ sid: 'CA_ADMIN', status: 'queued' })
  }) as typeof fetch
  try {
    const response = await worker.fetch(new Request('https://phone.example/twilio/outbound', {
      method: 'POST',
      headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ to: '+15550000003' }),
    }), makeEnv(store.binding))
    assert.equal(response.status, 202)
    const params = new URLSearchParams(twilioBody)
    assert.equal(params.get('MachineDetection'), 'Enable')
    assert.equal(params.get('AsyncAmd'), 'true')
    assert.match(params.get('Url') ?? '', /\/twilio\/outbound\?call_context_id=/)
    assert.equal(store.states.has('CA_ADMIN'), true)
  } finally { globalThis.fetch = previousFetch }
})

test('live phone worker exposes no chat-completions route and invokes no OpenRouter path', async () => {
  const store = makeStateBinding()
  const previousFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => { called = true; throw new Error('unexpected upstream request') }) as typeof fetch
  try {
    const response = await worker.fetch(new Request('https://phone.example/v1/chat/completions', { method: 'POST', body: '{}' }), makeEnv(store.binding))
    assert.equal(response.status, 404)
    assert.equal(called, false)
  } finally { globalThis.fetch = previousFetch }
})

test('ElevenLabs customer lookup can see only allow-listed backend fields', async () => {
  const store = makeStateBinding()
  const env = makeEnv(store.binding)
  const previousFetch = globalThis.fetch
  let callContextId = ''
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes('/register-call')) {
      const body = JSON.parse(String(init?.body ?? '{}'))
      callContextId = body.conversation_initiation_client_data.dynamic_variables.call_context_id
      return new Response(TWIML, { status: 200 })
    }
    if (url === 'https://backend.example/tools/customer-lookup') {
      return Response.json({
        identity_status: 'verified', display_name: 'Approved Name', access_tier: 'known_contact',
        relationship_summary: 'Approved relationship context', raw_phone: '+15550000001',
        database_row: { secret: 'must-not-leak' }, service_role_key: 'never',
      })
    }
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch
  try {
    const inbound = await signedTwilioRequest('https://phone.example/twilio/inbound', {
      CallSid: 'CA_TOOL', From: '+15550000001', To: '+15550000002',
    })
    assert.equal((await worker.fetch(inbound, env)).status, 200)
    const allowed = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/customer-lookup', {
      method: 'POST',
      headers: { 'x-caroline-tool-key': TOOL_SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ call_context_id: callContextId }),
    }), env)
    assert.equal(allowed.status, 200)
    const payload = await allowed.json() as any
    assert.equal(payload.caller.display_name, 'Approved Name')
    const serialized = JSON.stringify(payload)
    assert.equal(serialized.includes('+1555'), false)
    assert.equal(serialized.includes('must-not-leak'), false)
    assert.equal(serialized.includes('service_role_key'), false)
  } finally { globalThis.fetch = previousFetch }
})

test('write actions require prepare + explicit confirmation + short-lived server token', async () => {
  const store = makeStateBinding()
  const env = makeEnv(store.binding)
  const previousFetch = globalThis.fetch
  let callContextId = ''
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes('/register-call')) {
      const body = JSON.parse(String(init?.body ?? '{}'))
      callContextId = body.conversation_initiation_client_data.dynamic_variables.call_context_id
      return new Response(TWIML, { status: 200 })
    }
    if (url.endsWith('/tools/prepare-action')) return Response.json({ action_id: 'act_123', summary: 'Schedule the approved appointment.' })
    if (url.endsWith('/tools/commit-action')) return Response.json({ ok: true, status: 'completed', reference: 'ref_123' })
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch
  try {
    const inbound = await signedTwilioRequest('https://phone.example/twilio/inbound', { CallSid: 'CA_WRITE', From: '+15550000001', To: '+15550000002' })
    await worker.fetch(inbound, env)
    const headers = { 'x-caroline-tool-key': TOOL_SECRET, 'content-type': 'application/json' }
    const prepared = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/prepare-action', {
      method: 'POST', headers, body: JSON.stringify({ call_context_id: callContextId, action_type: 'schedule', action: { when: 'tomorrow' } }),
    }), env)
    assert.equal(prepared.status, 200)
    const prep = await prepared.json() as any
    const denied = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/commit-action', {
      method: 'POST', headers, body: JSON.stringify({ call_context_id: callContextId, action_id: prep.action_id, confirmation_token: prep.confirmation_token, confirmed: false }),
    }), env)
    assert.equal(denied.status, 409)
    const committed = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/commit-action', {
      method: 'POST', headers, body: JSON.stringify({ call_context_id: callContextId, action_id: prep.action_id, confirmation_token: prep.confirmation_token, confirmed: true }),
    }), env)
    assert.equal(committed.status, 200)
  } finally { globalThis.fetch = previousFetch }
})

test('post-call events are HMAC-verified, idempotent, correlated, and queued once without transcript payload', async () => {
  const store = makeStateBinding()
  const ledger = makeEventLedger()
  const queue = makeQueue()
  const env: Env = { ...makeEnv(store.binding), EVENT_LEDGER: ledger.binding, POST_CALL_QUEUE: queue.binding }
  await (store.binding as any).get('ctx_post').fetch('https://state/state', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ call_context_id: 'ctx_post_call_1234567890', call_sid: 'CA_POST', created_at: new Date().toISOString() }),
  })
  await (store.binding as any).get('CA_POST').fetch('https://state/state', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ call_context_id: 'ctx_post_call_1234567890', call_sid: 'CA_POST', created_at: new Date().toISOString() }),
  })

  const timestamp = Math.floor(Date.now() / 1000)
  const raw = JSON.stringify({
    type: 'post_call_transcription', event_timestamp: timestamp,
    data: {
      conversation_id: 'conv_123', agent_id: 'agent_inbound', status: 'done',
      conversation_initiation_client_data: { dynamic_variables: { call_context_id: 'ctx_post_call_1234567890' } },
      transcript: [{ role: 'user', message: 'large transcript stays out of queue message' }],
    },
  })
  const signature = await elevenLabsSignature(raw, timestamp)
  const makeRequest = () => new Request('https://phone.example/elevenlabs/webhooks/post-call', {
    method: 'POST', headers: { 'content-type': 'application/json', 'elevenlabs-signature': signature }, body: raw,
  })
  const bad = await worker.fetch(new Request('https://phone.example/elevenlabs/webhooks/post-call', {
    method: 'POST', headers: { 'content-type': 'application/json', 'elevenlabs-signature': 't=1,v0=bad' }, body: raw,
  }), env)
  assert.equal(bad.status, 401)

  assert.equal((await worker.fetch(makeRequest(), env)).status, 200)
  assert.equal(queue.messages.length, 1)
  assert.equal(JSON.stringify(queue.messages[0]).includes('large transcript'), false)
  assert.equal(queue.messages[0].conversation_id, 'conv_123')
  assert.equal((await worker.fetch(makeRequest(), env)).status, 200)
  assert.equal(queue.messages.length, 1)
})
