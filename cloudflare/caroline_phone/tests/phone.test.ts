import assert from 'node:assert/strict'
import test from 'node:test'
import worker, { type Env } from '../src/index'
import { expectedTwilioSignature } from '../src/twilio-security'

const TWILIO_TOKEN = '12345'
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://example.invalid" /></Connect></Response>'

function makeDoBinding() {
  const patches: Array<Record<string, unknown>> = []
  return {
    patches,
    binding: {
      idFromName(name: string) {
        return name
      },
      get() {
        return {
          async fetch(_input: RequestInfo | URL, init?: RequestInit) {
            patches.push(JSON.parse(String(init?.body ?? '{}')))
            return Response.json({ ok: true })
          },
        }
      },
    },
  }
}

function makeEnv(binding: ReturnType<typeof makeDoBinding>['binding']): Env {
  return {
    TWILIO_AUTH_TOKEN: TWILIO_TOKEN,
    ELEVENLABS_API_KEY: 'test-elevenlabs-key',
    ELEVENLABS_AGENT_ID: 'agent_test',
    ELEVENLABS_BRANCH_ID: 'agtbrch_cloudflare_refactor',
    CALL_SESSION: binding,
  }
}

async function signedFormRequest(url: string, values: Record<string, string>): Promise<Request> {
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

test('rejects an unsigned Twilio route before state or ElevenLabs work', async () => {
  const store = makeDoBinding()
  const request = new Request('https://phone.example/twilio/inbound', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'CallSid=CA1&From=%2B15550000001&To=%2B15550000002',
  })
  const response = await worker.fetch(request, makeEnv(store.binding))
  assert.equal(response.status, 403)
  assert.equal(store.patches.length, 0)
})

test('inbound verifies Twilio, registers with ElevenLabs, uses refactor branch, and persists state', async () => {
  const store = makeDoBinding()
  const previousFetch = globalThis.fetch
  let registerBody: any = null
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    registerBody = JSON.parse(String(init?.body ?? '{}'))
    return new Response(TWIML, { status: 200, headers: { 'content-type': 'application/xml' } })
  }) as typeof fetch

  try {
    const request = await signedFormRequest('https://phone.example/twilio/inbound', {
      CallSid: 'CA_INBOUND',
      From: '+15550000001',
      To: '+15550000002',
    })
    const response = await worker.fetch(request, makeEnv(store.binding))
    assert.equal(response.status, 200)
    assert.equal(await response.text(), TWIML)
    assert.equal(registerBody.direction, 'inbound')
    assert.equal(registerBody.conversation_initiation_client_data.branch_id, 'agtbrch_cloudflare_refactor')
    const vars = registerBody.conversation_initiation_client_data.dynamic_variables
    assert.equal(vars.caller_access_tier, 'tier_0_unknown_unverified')
    assert.equal(vars.caller_identity_status, 'unknown')
    assert.equal(vars.calendar_share_level, 'none')
    assert.equal(vars.caller_permissions_json, '{}')
    assert.equal(store.patches[0].register_status, 'registering')
    assert.equal(store.patches[1].register_status, 'registered')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('outbound registers direction=outbound', async () => {
  const store = makeDoBinding()
  const previousFetch = globalThis.fetch
  let direction = ''
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    direction = JSON.parse(String(init?.body ?? '{}')).direction
    return new Response(TWIML, { status: 200 })
  }) as typeof fetch

  try {
    const request = await signedFormRequest('https://phone.example/twilio/outbound', {
      CallSid: 'CA_OUTBOUND',
      From: '+15550000002',
      To: '+15550000003',
    })
    const response = await worker.fetch(request, makeEnv(store.binding))
    assert.equal(response.status, 200)
    assert.equal(direction, 'outbound')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('status and AMD callbacks update the per-call Durable Object', async () => {
  const store = makeDoBinding()
  const env = makeEnv(store.binding)

  const statusRequest = await signedFormRequest('https://phone.example/twilio/status', {
    CallSid: 'CA_STATE',
    CallStatus: 'answered',
  })
  const statusResponse = await worker.fetch(statusRequest, env)
  assert.equal(statusResponse.status, 204)

  const amdRequest = await signedFormRequest('https://phone.example/twilio/amd', {
    CallSid: 'CA_STATE',
    AnsweredBy: 'human',
  })
  const amdResponse = await worker.fetch(amdRequest, env)
  assert.equal(amdResponse.status, 204)

  assert.equal(store.patches[0].call_status, 'answered')
  assert.equal(store.patches[1].answered_by, 'human')
})
