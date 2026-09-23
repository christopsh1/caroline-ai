import assert from 'node:assert/strict'
import test from 'node:test'
import { handleTwilioWebhook } from '../src/handlers/twilio.ts'
import { expectedTwilioSignature } from '../src/lib/twilio-security.ts'

const token = '12345'

function fakeKv() {
  return {
    values: new Map<string, string>(),
    async get(key: string) { return this.values.get(key) ?? null },
    async put(key: string, value: string) { this.values.set(key, value) },
  }
}

async function signedFormRequest(path: string, params: Record<string, string>): Promise<Request> {
  const url = `https://voice.example.com${path}`
  const raw = new URLSearchParams(params).toString()
  const sig = await expectedTwilioSignature(token, url, params)
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': sig,
    },
    body: raw,
  })
}

test('inbound route registers call with ElevenLabs and returns TwiML', async () => {
  const kv = fakeKv()
  let captured: any = null
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), 'https://api.elevenlabs.io/v1/convai/twilio/register-call')
    assert.equal(new Headers(init?.headers).get('xi-api-key'), 'el-key')
    captured = JSON.parse(String(init?.body))
    return new Response('<?xml version="1.0"?><Response><Connect/></Response>', { status: 200 })
  }) as typeof fetch

  const req = await signedFormRequest('/twilio/inbound', {
    CallSid: 'CA1234',
    From: '+15550000001',
    To: '+15550000002',
  })
  const res = await handleTwilioWebhook(req, {
    TWILIO_AUTH_TOKEN: token,
    ELEVENLABS_API_KEY: 'el-key',
    ELEVENLABS_AGENT_ID: 'agent_test',
    CAROLINE_PHONE: kv as any,
  }, 'r1', fetcher)

  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /application\/xml/)
  assert.equal(captured.agent_id, 'agent_test')
  assert.equal(captured.direction, 'inbound')
  assert.equal(captured.from_number, '+15550000001')
  assert.equal(captured.to_number, '+15550000002')
  assert.deepEqual(captured.conversation_initiation_client_data.dynamic_variables, {
    telephony_provider: 'twilio',
    call_direction: 'inbound',
    twilio_call_sid: 'CA1234',
  })
  const stored = kv.values.get('twilio:call:CA1234') ?? ''
  assert.equal(stored.includes('+15550000001'), false)
  assert.equal(stored.includes('+15550000002'), false)
})

test('outbound route registers the call with outbound direction', async () => {
  let direction = ''
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    direction = JSON.parse(String(init?.body)).direction
    return new Response('<Response><Connect/></Response>', { status: 200 })
  }) as typeof fetch
  const req = await signedFormRequest('/twilio/outbound', {
    CallSid: 'CA5678',
    From: '+15550000002',
    To: '+15550000003',
  })
  const res = await handleTwilioWebhook(req, {
    TWILIO_AUTH_TOKEN: token,
    ELEVENLABS_API_KEY: 'el-key',
    ELEVENLABS_AGENT_ID: 'agent_test',
    CAROLINE_PHONE: fakeKv() as any,
  }, 'r2', fetcher)
  assert.equal(res.status, 200)
  assert.equal(direction, 'outbound')
})

test('status callback stores operational call state in KV', async () => {
  const kv = fakeKv()
  const req = await signedFormRequest('/twilio/status', {
    CallSid: 'CA9999',
    CallStatus: 'completed',
    Direction: 'inbound',
  })
  const res = await handleTwilioWebhook(req, { TWILIO_AUTH_TOKEN: token, CAROLINE_PHONE: kv as any }, 'r3')
  assert.equal(res.status, 200)
  const state = JSON.parse(kv.values.get('twilio:call:CA9999') ?? '{}')
  assert.equal(state.call_status, 'completed')
  assert.equal(state.direction, 'inbound')
})

test('AMD callback stores human-or-machine result separately from inbound flow', async () => {
  const kv = fakeKv()
  const req = await signedFormRequest('/twilio/amd', {
    CallSid: 'CA7777',
    AnsweredBy: 'machine_start',
  })
  const res = await handleTwilioWebhook(req, { TWILIO_AUTH_TOKEN: token, CAROLINE_PHONE: kv as any }, 'r4')
  assert.equal(res.status, 200)
  const state = JSON.parse(kv.values.get('twilio:call:CA7777') ?? '{}')
  assert.equal(state.answered_by, 'machine_start')
})

test('register-call fails closed when ElevenLabs server credentials are absent', async () => {
  let called = false
  const fetcher = (async () => { called = true; return new Response('<Response/>') }) as typeof fetch
  const req = await signedFormRequest('/twilio/inbound', {
    CallSid: 'CA0001',
    From: '+15550000001',
    To: '+15550000002',
  })
  const res = await handleTwilioWebhook(req, {
    TWILIO_AUTH_TOKEN: token,
    CAROLINE_PHONE: fakeKv() as any,
  }, 'r5', fetcher)
  assert.equal(res.status, 503)
  assert.equal(called, false)
})
