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
    idFromName(name: string) {
      return name
    },
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
  const claimed = new Set<string>()
  return {
    binding: {
      idFromName(name: string) {
        return name
      },
      get(id: unknown) {
        const key = String(id)
        return {
          async fetch(_input: RequestInfo | URL, init?: RequestInit) {
            if (init?.method !== 'POST') return new Response('method_not_allowed', { status: 405 })
            const duplicate = claimed.has(key)
            if (!duplicate) claimed.add(key)
            return Response.json({ ok: true, duplicate })
          },
        }
      },
    },
    claimed,
  }
}

function makeQueue() {
  const messages: unknown[] = []
  return {
    messages,
    binding: {
      async send(message: unknown) {
        messages.push(message)
      },
    },
  }
}

function makeEnv(callBinding: ReturnType<typeof makeStateBinding>['binding']): Env {
  return {
    TWILIO_AUTH_TOKEN: TWILIO_TOKEN,
    ELEVENLABS_API_KEY: 'test-elevenlabs-key',
    ELEVENLABS_TOOL_SECRET: TOOL_SECRET,
    ELEVENLABS_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ELEVENLABS_INBOUND_AGENT_ID: 'agent_inbound',
    ELEVENLABS_INBOUND_BRANCH_ID: 'agtbrch_inbound_main',
    ELEVENLABS_OUTBOUND_AGENT_ID: 'agent_outbound',
    ELEVENLABS_OUTBOUND_BRANCH_ID: 'agtbrch_outbound_main',
    CALL_SESSION: callBinding,
  }
}

async function signedTwilioRequest(url: string, values: Record<string, string>): Promise<Request> {
  const params = new URLSearchParams(values)
  const signature = await expectedTwilioSignature(TWILIO_TOKEN, url, params)
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: params.toString(),
  })
}

async function elevenLabsSignature(rawBody: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)),
  )
  const digest = Array.from(signed, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `t=${timestamp},v0=${digest}`
}

test('matches Twilio official HMAC-SHA1 form vector', async () => {
  const signature = await expectedTwilioSignature(
    TWILIO_TOKEN,
    'https://example.com/myapp.php?foo=1&bar=2',
    {
      CallSid: 'CA1234567890ABCDE',
      Caller: '+14158675310',
      Digits: '1234',
      From: '+14158675310',
      To: '+18005551212',
    },
  )
  assert.equal(signature, 'L/OH5YylLD5NRKLltdqwSvS0BnU=')
})

test('rejects unsigned Twilio requests before state or ElevenLabs work', async () => {
  const store = makeStateBinding()
  const request = new Request('https://phone.example/twilio/inbound', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'CallSid=CA1&From=%2B15550000001&To=%2B15550000002',
  })
  const response = await worker.fetch(request, makeEnv(store.binding))
  assert.equal(response.status, 403)
  assert.equal(store.states.size, 0)
})

test('inbound returns ElevenLabs-produced TwiML and passes only opaque call_context_id', async () => {
  const store = makeStateBinding()
  const previousFetch = globalThis.fetch
  let registerBody: any = null
  const upstreamUrls: string[] = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    upstreamUrls.push(url)
    registerBody = JSON.parse(String(init?.body ?? '{}'))
    return new Response(TWIML, { status: 200, headers: { 'content-type': 'application/xml' } })
  }) as typeof fetch

  try {
    const request = await signedTwilioRequest('https://phone.example/twilio/inbound', {
      CallSid: 'CA_INBOUND',
      From: '+15550000001',
      To: '+15550000002',
    })
    const response = await worker.fetch(request, makeEnv(store.binding))
    assert.equal(response.status, 200)
    assert.equal(await response.text(), TWIML)
    assert.equal(registerBody.agent_id, 'agent_inbound')
    assert.equal(registerBody.direction, 'inbound')
    assert.equal(registerBody.conversation_initiation_client_data.branch_id, 'agtbrch_inbound_main')

    const vars = registerBody.conversation_initiation_client_data.dynamic_variables
    assert.deepEqual(Object.keys(vars), ['call_context_id'])
    assert.equal(typeof vars.call_context_id, 'string')
    assert.ok(vars.call_context_id.length >= 32)
    assert.ok(store.states.has('CA_INBOUND'))
    assert.ok(store.states.has(vars.call_context_id))
    assert.deepEqual(upstreamUrls, ['https://api.elevenlabs.io/v1/convai/twilio/register-call'])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('outbound uses the dedicated ElevenLabs outbound agent', async () => {
  const store = makeStateBinding()
  const previousFetch = globalThis.fetch
  let registerBody: any = null

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    registerBody = JSON.parse(String(init?.body ?? '{}'))
    return new Response(TWIML, { status: 200 })
  }) as typeof fetch

  try {
    const request = await signedTwilioRequest('https://phone.example/twilio/outbound', {
      CallSid: 'CA_OUTBOUND',
      From: '+15550000002',
      To: '+15550000003',
    })
    const response = await worker.fetch(request, makeEnv(store.binding))
    assert.equal(response.status, 200)
    assert.equal(registerBody.agent_id, 'agent_outbound')
    assert.equal(registerBody.direction, 'outbound')
    assert.equal(registerBody.conversation_initiation_client_data.branch_id, 'agtbrch_outbound_main')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('live phone worker exposes no chat-completions route and invokes no OpenRouter path', async () => {
  const store = makeStateBinding()
  const previousFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => {
    called = true
    throw new Error('unexpected upstream request')
  }) as typeof fetch

  try {
    const response = await worker.fetch(
      new Request('https://phone.example/v1/chat/completions', { method: 'POST', body: '{}' }),
      makeEnv(store.binding),
    )
    assert.equal(response.status, 404)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('ElevenLabs tool calls require auth and return only approved minimal data', async () => {
  const store = makeStateBinding()
  const env = makeEnv(store.binding)
  const previousFetch = globalThis.fetch
  let callContextId = ''

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    callContextId = body.conversation_initiation_client_data.dynamic_variables.call_context_id
    return new Response(TWIML, { status: 200 })
  }) as typeof fetch

  try {
    const inbound = await signedTwilioRequest('https://phone.example/twilio/inbound', {
      CallSid: 'CA_TOOL',
      From: '+15550000001',
      To: '+15550000002',
    })
    assert.equal((await worker.fetch(inbound, env)).status, 200)
  } finally {
    globalThis.fetch = previousFetch
  }

  const denied = await worker.fetch(
    new Request('https://phone.example/elevenlabs/tools/customer-lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ call_context_id: callContextId }),
    }),
    env,
  )
  assert.equal(denied.status, 401)

  const allowed = await worker.fetch(
    new Request('https://phone.example/elevenlabs/tools/customer-lookup', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOOL_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ call_context_id: callContextId }),
    }),
    env,
  )
  assert.equal(allowed.status, 200)
  const payload = (await allowed.json()) as any
  assert.deepEqual(payload, {
    ok: true,
    caller: { identity_status: 'unverified', protected_data_disclosed: false },
  })
  assert.equal(JSON.stringify(payload).includes('+1555'), false)
})

test('post-call events are signature-verified, idempotent, and queued once', async () => {
  const store = makeStateBinding()
  const ledger = makeEventLedger()
  const queue = makeQueue()
  const env: Env = {
    ...makeEnv(store.binding),
    EVENT_LEDGER: ledger.binding,
    POST_CALL_QUEUE: queue.binding,
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const raw = JSON.stringify({
    type: 'post_call_transcription',
    event_timestamp: timestamp,
    data: { conversation_id: 'conv_123', agent_id: 'agent_inbound', status: 'done' },
  })
  const signature = await elevenLabsSignature(raw, timestamp)

  const makeRequest = () => new Request('https://phone.example/elevenlabs/webhooks/post-call', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'elevenlabs-signature': signature },
    body: raw,
  })

  const first = await worker.fetch(makeRequest(), env)
  assert.equal(first.status, 200)
  assert.equal(queue.messages.length, 1)

  const second = await worker.fetch(makeRequest(), env)
  assert.equal(second.status, 200)
  assert.equal(queue.messages.length, 1)
  const secondPayload = (await second.json()) as any
  assert.equal(secondPayload.duplicate, true)
})
