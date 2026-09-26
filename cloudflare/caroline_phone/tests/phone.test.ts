import assert from 'node:assert/strict'
import test from 'node:test'
import worker, { type Env } from '../src/index'
import { setDatabaseQueryForTests, type DatabaseQueryExecutor } from '../src/database'
import { expectedTwilioSignature } from '../src/twilio-security'

const TWILIO_TOKEN = '12345'
const TOOL_SECRET = 'tool-secret'
const WEBHOOK_SECRET = 'webhook-secret'
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTION_ID = '22222222-2222-4222-8222-222222222222'
const CALL_ID = '33333333-3333-4333-8333-333333333333'
const TRANSFER_DESTINATION_ID = '44444444-4444-4444-8444-444444444444'
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://example.invalid" /></Connect></Response>'

type DbOptions = {
  blocked?: boolean
  customer?: Record<string, unknown> | null
  verifiedCustomerId?: string | null
  knowledge?: Array<Record<string, unknown>>
  transferDestination?: { id: string; display_name: string; e164_phone: string } | null
}

function makeDb(options: DbOptions = {}) {
  let preparedAction: { action_type: string; action_payload: Record<string, unknown> } | null = null
  const queries: string[] = []

  const executor: DatabaseQueryExecutor = async <T extends Record<string, unknown>>(text: string, params: unknown[] = []) => {
    const sql = text.replace(/\s+/g, ' ').trim().toLowerCase()
    queries.push(sql)

    if (sql.includes('from tenants') && sql.includes('tenant_key')) return [{ id: TENANT_ID }] as T[]
    if (sql.includes('from dnc_records')) return (options.blocked ? [{ blocked: true }] : []) as T[]
    if (sql.includes('from caller_identity_links')) return (options.customer ? [options.customer] : []) as T[]
    if (sql.includes('from verification_sessions') && sql.includes('customer_id::text')) {
      return (options.verifiedCustomerId ? [{ customer_id: options.verifiedCustomerId }] : []) as T[]
    }
    if (sql.includes('from knowledge_chunks kc')) return (options.knowledge ?? []) as T[]
    if (sql.includes('from transfer_destinations')) {
      return (options.transferDestination ? [options.transferDestination] : []) as T[]
    }
    if (sql.startsWith('insert into confirmation_tokens')) {
      preparedAction = {
        action_type: String(params[2]),
        action_payload: JSON.parse(String(params[3])) as Record<string, unknown>,
      }
      return [{ action_id: ACTION_ID, expires_at: new Date(Date.now() + 120_000).toISOString() }] as T[]
    }
    if (sql.startsWith('update confirmation_tokens')) return (preparedAction ? [preparedAction] : []) as T[]
    if (sql.startsWith('insert into callbacks')) return [{ id: '55555555-5555-4555-8555-555555555555' }] as T[]
    if (sql.startsWith('insert into appointments')) return [{ id: '66666666-6666-4666-8666-666666666666' }] as T[]
    if (sql.startsWith('insert into transfers')) return [{ id: '77777777-7777-4777-8777-777777777777' }] as T[]
    if (sql.includes('select id::text as id from calls')) return [{ id: CALL_ID }] as T[]
    if (sql.startsWith('update calls') && sql.includes('returning id::text')) return [{ id: CALL_ID }] as T[]
    return [] as T[]
  }

  return { executor, queries }
}

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

function makeR2() {
  const objects = new Map<string, string>()
  return {
    objects,
    binding: {
      async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream) {
        objects.set(key, typeof value === 'string' ? value : '[binary]')
      },
    },
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
    OPENAI_API_KEY: 'embedding-key',
    DATABASE_URL: 'postgresql://test.invalid/caroline',
    CAROLINE_TENANT_KEY: 'caroline',
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

async function createInboundContext(store: ReturnType<typeof makeStateBinding>, env: Env, callSid: string) {
  const previousFetch = globalThis.fetch
  let callContextId = ''
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    callContextId = body.conversation_initiation_client_data.dynamic_variables.call_context_id
    return new Response(TWIML, { status: 200 })
  }) as typeof fetch
  try {
    const inbound = await signedTwilioRequest('https://phone.example/twilio/inbound', {
      CallSid: callSid, From: '+15550000001', To: '+15550000002',
    })
    assert.equal((await worker.fetch(inbound, env)).status, 200)
    return callContextId
  } finally {
    globalThis.fetch = previousFetch
  }
}

test.afterEach(() => setDatabaseQueryForTests(null))

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

test('inbound returns ElevenLabs TwiML and passes only opaque call_context_id', async () => {
  const store = makeStateBinding()
  const db = makeDb()
  setDatabaseQueryForTests(db.executor)
  const previousFetch = globalThis.fetch
  const registerBodies: any[] = []
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    registerBodies.push(JSON.parse(String(init?.body ?? '{}')))
    return new Response(TWIML, { status: 200 })
  }) as typeof fetch
  try {
    for (let i = 0; i < 2; i += 1) {
      const request = await signedTwilioRequest('https://phone.example/twilio/inbound', {
        CallSid: 'CA_INBOUND', From: '+15550000001', To: '+15550000002',
      })
      assert.equal((await worker.fetch(request, makeEnv(store.binding))).status, 200)
    }
    const firstVars = registerBodies[0].conversation_initiation_client_data.dynamic_variables
    const secondVars = registerBodies[1].conversation_initiation_client_data.dynamic_variables
    assert.equal(registerBodies[0].agent_id, 'agent_inbound')
    assert.deepEqual(Object.keys(firstVars), ['call_context_id'])
    assert.equal(firstVars.call_context_id, secondVars.call_context_id)
    assert.ok(store.states.has(firstVars.call_context_id))
    assert.equal(JSON.stringify(registerBodies).includes('openrouter'), false)
  } finally { globalThis.fetch = previousFetch }
})

test('outbound signed Twilio leg uses the dedicated outbound agent', async () => {
  const store = makeStateBinding()
  const db = makeDb()
  setDatabaseQueryForTests(db.executor)
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

test('authorized outbound trigger enforces DNC before Twilio', async () => {
  const store = makeStateBinding()
  const db = makeDb({ blocked: true })
  setDatabaseQueryForTests(db.executor)
  const previousFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => { called = true; throw new Error('Twilio must not be called') }) as typeof fetch
  try {
    const response = await worker.fetch(new Request('https://phone.example/twilio/outbound', {
      method: 'POST',
      headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ to: '+15550000003' }),
    }), makeEnv(store.binding))
    assert.equal(response.status, 409)
    assert.equal(called, false)
  } finally { globalThis.fetch = previousFetch }
})

test('authorized outbound trigger creates Twilio call with async AMD and persists audit context', async () => {
  const store = makeStateBinding()
  const db = makeDb()
  setDatabaseQueryForTests(db.executor)
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
    assert.equal(params.get('Record'), 'false')
    assert.match(params.get('Url') ?? '', /\/twilio\/outbound\?call_context_id=/)
    assert.equal(store.states.has('CA_ADMIN'), true)
    assert.equal(db.queries.some((query) => query.startsWith('insert into call_contexts')), true)
  } finally { globalThis.fetch = previousFetch }
})

test('live phone worker exposes no chat-completions route and invokes no upstream model proxy', async () => {
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

test('customer lookup discloses protected fields only after server-side verification', async () => {
  const store = makeStateBinding()
  const db = makeDb({
    customer: {
      customer_id: '88888888-8888-4888-8888-888888888888',
      display_name: 'Approved Name',
      notes_safe: 'Approved relationship context',
      calendar_share_level: 'details',
      relationship_disclosure_allowed: true,
      verified: true,
    },
  })
  setDatabaseQueryForTests(db.executor)
  const env = makeEnv(store.binding)
  const callContextId = await createInboundContext(store, env, 'CA_TOOL')

  const allowed = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/customer-lookup', {
    method: 'POST',
    headers: { 'x-caroline-tool-key': TOOL_SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({ call_context_id: callContextId }),
  }), env)
  assert.equal(allowed.status, 200)
  const payload = await allowed.json() as any
  assert.equal(payload.caller.identity_status, 'verified')
  assert.equal(payload.caller.display_name, 'Approved Name')
  assert.equal(JSON.stringify(payload).includes('+1555'), false)
})

test('customer lookup with an unverified match returns no name or relationship disclosure', async () => {
  const store = makeStateBinding()
  const db = makeDb({
    customer: {
      customer_id: '88888888-8888-4888-8888-888888888888',
      display_name: 'Must Stay Hidden',
      notes_safe: 'Must Stay Hidden',
      calendar_share_level: 'details',
      relationship_disclosure_allowed: true,
      verified: false,
    },
  })
  setDatabaseQueryForTests(db.executor)
  const env = makeEnv(store.binding)
  const callContextId = await createInboundContext(store, env, 'CA_UNVERIFIED')
  const response = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/customer-lookup', {
    method: 'POST', headers: { authorization: `Bearer ${TOOL_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ call_context_id: callContextId }),
  }), env)
  const payload = await response.json() as any
  assert.equal(response.status, 200)
  assert.equal(payload.caller.identity_status, 'candidate')
  assert.equal('display_name' in payload.caller, false)
  assert.equal(JSON.stringify(payload).includes('Must Stay Hidden'), false)
})

test('knowledge retrieval uses only the fixed 1536-dimension OpenAI embedding space', async () => {
  const store = makeStateBinding()
  const db = makeDb({
    knowledge: [{ id: '99999999-9999-4999-8999-999999999999', title: 'Hours', content: 'We are open weekdays.', score: 0.91 }],
  })
  setDatabaseQueryForTests(db.executor)
  const env = makeEnv(store.binding)
  const callContextId = await createInboundContext(store, env, 'CA_RAG')
  const previousFetch = globalThis.fetch
  let embeddingRequest: any = null
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    assert.equal(url, 'https://api.openai.com/v1/embeddings')
    embeddingRequest = JSON.parse(String(init?.body ?? '{}'))
    return Response.json({ data: [{ embedding: Array.from({ length: 1536 }, () => 0.01) }] })
  }) as typeof fetch
  try {
    const response = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/search-knowledge', {
      method: 'POST', headers: { 'x-caroline-tool-key': TOOL_SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ call_context_id: callContextId, query: 'When are you open?' }),
    }), env)
    assert.equal(response.status, 200)
    assert.equal(embeddingRequest.model, 'text-embedding-3-small')
    assert.equal(embeddingRequest.dimensions, 1536)
    assert.equal(db.queries.some((query) => query.includes('kc.embedding_version = $5')), true)
  } finally { globalThis.fetch = previousFetch }
})

test('consequential callback write requires prepare, explicit confirmation, and one-time server token', async () => {
  const store = makeStateBinding()
  const db = makeDb()
  setDatabaseQueryForTests(db.executor)
  const env = makeEnv(store.binding)
  const callContextId = await createInboundContext(store, env, 'CA_WRITE')
  const headers = { 'x-caroline-tool-key': TOOL_SECRET, 'content-type': 'application/json' }

  const prepared = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/prepare-action', {
    method: 'POST', headers, body: JSON.stringify({ call_context_id: callContextId, action_type: 'callback_request', action: { reason: 'Follow up' } }),
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
  assert.equal((await committed.json() as any).status, 'requested')
})

test('transfer uses an allow-listed Neon destination and Twilio call control only after confirmation', async () => {
  const store = makeStateBinding()
  const db = makeDb({ transferDestination: { id: TRANSFER_DESTINATION_ID, display_name: 'Front Desk', e164_phone: '+15550000009' } })
  setDatabaseQueryForTests(db.executor)
  const env = makeEnv(store.binding)
  const callContextId = await createInboundContext(store, env, 'CA_TRANSFER')
  const headers = { authorization: `Bearer ${TOOL_SECRET}`, 'content-type': 'application/json' }
  const prepared = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/prepare-action', {
    method: 'POST', headers,
    body: JSON.stringify({ call_context_id: callContextId, action_type: 'transfer_request', action: { destination_key: 'front_desk' } }),
  }), env)
  const prep = await prepared.json() as any

  const previousFetch = globalThis.fetch
  let transferBody = ''
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    assert.match(url, /Calls\/CA_TRANSFER\.json/)
    transferBody = String(init?.body ?? '')
    return Response.json({ sid: 'CA_TRANSFER', status: 'in-progress' })
  }) as typeof fetch
  try {
    const response = await worker.fetch(new Request('https://phone.example/elevenlabs/tools/transfer', {
      method: 'POST', headers,
      body: JSON.stringify({ call_context_id: callContextId, action_id: prep.action_id, confirmation_token: prep.confirmation_token, confirmed: true }),
    }), env)
    assert.equal(response.status, 200)
    const params = new URLSearchParams(transferBody)
    assert.match(params.get('Twiml') ?? '', /<Dial>\+15550000009<\/Dial>/)
  } finally { globalThis.fetch = previousFetch }
})

test('post-call events are HMAC verified, idempotent, correlated, and queued without transcript payload', async () => {
  const store = makeStateBinding()
  const ledger = makeEventLedger()
  const queue = makeQueue()
  const env: Env = { ...makeEnv(store.binding), EVENT_LEDGER: ledger.binding, POST_CALL_QUEUE: queue.binding }
  await (store.binding as any).get('ctx_post_call_1234567890').fetch('https://state/state', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ call_context_id: 'ctx_post_call_1234567890', call_sid: 'CA_POST', created_at: new Date().toISOString() }),
  })

  const timestamp = Math.floor(Date.now() / 1000)
  const raw = JSON.stringify({
    type: 'post_call_transcription', event_timestamp: timestamp,
    data: {
      conversation_id: 'conv_123',
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
  assert.equal((await worker.fetch(makeRequest(), env)).status, 200)
  assert.equal(queue.messages.length, 1)
})

test('queue consumer persists ElevenLabs transcript directly to Neon and R2 with no backend proxy', async () => {
  const store = makeStateBinding()
  const db = makeDb()
  const r2 = makeR2()
  setDatabaseQueryForTests(db.executor)
  const env: Env = { ...makeEnv(store.binding), CAROLINE_TRANSCRIPTS: r2.binding }
  await (store.binding as any).get('ctx_queue_123456789012').fetch('https://state/state', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      call_context_id: 'ctx_queue_123456789012', call_sid: 'CA_QUEUE', direction: 'inbound', selected_agent_id: 'agent_inbound',
      from_number: '+15550000001', to_number: '+15550000002', register_status: 'registered', expires_at: new Date(Date.now() + 3600000).toISOString(),
    }),
  })

  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    assert.match(url, /elevenlabs\.io\/v1\/convai\/conversations\/conv_queue/)
    return Response.json({
      conversation_id: 'conv_queue', agent_id: 'agent_inbound', status: 'done',
      transcript: [{ role: 'user', message: 'Hello' }, { role: 'agent', message: 'Hi there' }],
      analysis: { transcript_summary: 'Caller greeted Caroline.' },
      metadata: { call_duration_secs: 12 },
    })
  }) as typeof fetch
  try {
    let acked = false
    let retried = false
    await worker.queue({ messages: [{
      body: { event_id: 'evt_queue', type: 'post_call_transcription', conversation_id: 'conv_queue', call_context_id: 'ctx_queue_123456789012' },
      ack: () => { acked = true },
      retry: () => { retried = true },
    }] }, env)
    assert.equal(acked, true)
    assert.equal(retried, false)
    assert.equal(db.queries.some((query) => query.startsWith('insert into call_transcripts')), true)
    assert.equal(db.queries.some((query) => query.startsWith('insert into conversation_summaries')), true)
    assert.equal(r2.objects.has('calls/ctx_queue_123456789012/conv_queue.json'), true)
  } finally { globalThis.fetch = previousFetch }
})
