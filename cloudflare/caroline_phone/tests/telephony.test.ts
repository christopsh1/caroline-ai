import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRegisterDynamicVariables,
  createTwilioOutboundCall,
  expectedTwilioSignature,
  isE164,
  registerElevenLabsCall,
  shouldHangupForAmd,
} from '../src/telephony.ts'

test('matches Twilio official HMAC-SHA1 form vector', async () => {
  const url = 'https://example.com/myapp.php?foo=1&bar=2'
  const params = new URLSearchParams({
    CallSid: 'CA1234567890ABCDE',
    Caller: '+14158675310',
    Digits: '1234',
    From: '+14158675310',
    To: '+18005551212',
  })
  assert.equal(await expectedTwilioSignature('12345', url, params), 'L/OH5YylLD5NRKLltdqwSvS0BnU=')
})

test('call-start variables are fail-closed for identity and permissions', () => {
  const vars = buildRegisterDynamicVariables({
    fromNumber: '+15550000001',
    toNumber: '+15550000002',
    direction: 'inbound',
  })
  assert.equal(vars.caller_identity_status, 'unknown')
  assert.equal(vars.caller_access_tier, 'tier_0_unknown_unverified')
  assert.equal(vars.caller_permissions_json, '{}')
  assert.equal(vars.calendar_share_level, 'none')
  assert.equal(vars.outbound_call_brief_json, '{}')
})

test('outbound register payload carries only the supplied owner brief plus safe defaults', async () => {
  const requests: Record<string, unknown>[] = []
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    return new Response(JSON.stringify('<Response><Connect/></Response>'), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const twiml = await registerElevenLabsCall(fetcher, 'test-key', 'agent_test', {
    fromNumber: '+15550000002',
    toNumber: '+15550000001',
    direction: 'outbound',
    outboundBriefJson: '{"purpose":"test"}',
  })

  assert.equal(twiml, '<Response><Connect/></Response>')
  assert.equal(requests.length, 1)
  const captured = requests[0]!
  assert.equal(captured.agent_id, 'agent_test')
  assert.equal(captured.direction, 'outbound')
  const initiation = captured.conversation_initiation_client_data as { dynamic_variables?: Record<string, string> }
  assert.equal(initiation.dynamic_variables?.outbound_call_brief_json, '{"purpose":"test"}')
  assert.equal(initiation.dynamic_variables?.caller_identity_status, 'unknown')
})

test('outbound Twilio call includes status and async AMD callbacks only when requested', async () => {
  let rawBody = ''
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    rawBody = String(init?.body ?? '')
    return new Response(JSON.stringify({ sid: 'CA_TEST', status: 'queued' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const created = await createTwilioOutboundCall(
    fetcher,
    { accountSid: 'AC_TEST', authToken: 'token', fromNumber: '+15550000001' },
    {
      toNumber: '+15550000002',
      voiceUrl: 'https://phone.example/twilio/outbound',
      statusUrl: 'https://phone.example/twilio/status',
      amdUrl: 'https://phone.example/twilio/amd',
      machineDetection: true,
    },
  )

  assert.equal(created.callSid, 'CA_TEST')
  const params = new URLSearchParams(rawBody)
  assert.equal(params.get('Url'), 'https://phone.example/twilio/outbound')
  assert.equal(params.get('StatusCallback'), 'https://phone.example/twilio/status')
  assert.equal(params.get('MachineDetection'), 'Enable')
  assert.equal(params.get('AsyncAmd'), 'true')
  assert.equal(params.get('AsyncAmdStatusCallback'), 'https://phone.example/twilio/amd')
  assert.deepEqual(params.getAll('StatusCallbackEvent'), ['initiated', 'ringing', 'answered', 'completed'])
})

test('phone normalization and AMD hangup policy are explicit', () => {
  assert.equal(isE164('+15550000001'), true)
  assert.equal(isE164('5550000001'), false)
  assert.equal(shouldHangupForAmd('machine_end_beep', 'true'), true)
  assert.equal(shouldHangupForAmd('human', 'true'), false)
  assert.equal(shouldHangupForAmd('machine_end_beep', 'false'), false)
})
