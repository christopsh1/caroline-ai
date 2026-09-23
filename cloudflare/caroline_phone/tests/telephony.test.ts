import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOutboundElevenLabsPayload } from '../src/elevenlabs.ts'
import {
  expectedTwilioSignature,
  isE164,
  parseTwilioForm,
  verifyTwilioSignature,
} from '../src/twilio.ts'

test('E.164 validation is strict enough for outbound calls', () => {
  assert.equal(isE164('+12155550123'), true)
  assert.equal(isE164('+442071838750'), true)
  assert.equal(isE164('2155550123'), false)
  assert.equal(isE164('+0123456789'), false)
  assert.equal(isE164('+1abc'), false)
})

test('Twilio form signature validation accepts exact request and rejects tampering', async () => {
  const url = 'https://phone.example.test/twilio/inbound'
  const rawBody = 'CallSid=CA1234567890ABCDEF1234567890ABCDEF&From=%2B12155550123&To=%2B12155550124'
  const authToken = 'unit-test-auth-token'
  const signature = await expectedTwilioSignature(authToken, url, parseTwilioForm(rawBody))

  const request = new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: rawBody,
  })

  assert.equal(await verifyTwilioSignature(request, rawBody, authToken), true)
  assert.equal(await verifyTwilioSignature(request, `${rawBody}&CallStatus=completed`, authToken), false)
})

test('outbound ElevenLabs payload matches the required contract and disables recording', () => {
  assert.deepEqual(
    buildOutboundElevenLabsPayload({
      agentId: 'agent-test',
      agentPhoneNumberId: 'phone-test',
      to: '+12155550123',
      firstMessage: 'Hello',
    }),
    {
      agent_id: 'agent-test',
      agent_phone_number_id: 'phone-test',
      to_number: '+12155550123',
      conversation_initiation_client_data: {
        dynamic_variables: {
          first_message: 'Hello',
        },
      },
      call_recording_enabled: false,
    },
  )
})
