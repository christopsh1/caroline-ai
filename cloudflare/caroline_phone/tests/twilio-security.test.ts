import assert from 'node:assert/strict'
import test from 'node:test'
import { handleTwilioWebhook } from '../src/handlers/twilio.ts'
import { expectedTwilioSignature, twilioPublicUrl, verifyTwilioRequest } from '../src/lib/twilio-security.ts'

const authToken = '12345'

test('matches Twilio official HMAC-SHA1 form-signature example', async () => {
  const url = 'https://example.com/myapp.php?foo=1&bar=2'
  const signature = await expectedTwilioSignature(authToken, url, {
    CallSid: 'CA1234567890ABCDE', Caller: '+14158675310', Digits: '1234', From: '+14158675310', To: '+18005551212',
  })
  assert.equal(signature, 'L/OH5YylLD5NRKLltdqwSvS0BnU=')
})

test('constructs validation URL from configured public origin and raw request path/query', () => {
  const req = new Request('https://internal.workers.dev/webhook/twilio/voice?foo=bar%20baz')
  assert.equal(twilioPublicUrl(req, 'https://voice.example.com/'), 'https://voice.example.com/webhook/twilio/voice?foo=bar%20baz')
})

test('verifies a signed form-urlencoded Twilio request', async () => {
  const publicUrl = 'https://voice.example.com/webhook/twilio/voice'
  const raw = 'CallSid=CA123&From=%2B15550000000&To=%2B15550000001'
  const signature = await expectedTwilioSignature(authToken, publicUrl, { CallSid: 'CA123', From: '+15550000000', To: '+15550000001' })
  const req = new Request('https://internal.workers.dev/webhook/twilio/voice', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature }, body: raw,
  })
  assert.equal((await verifyTwilioRequest(req, raw, authToken, 'https://voice.example.com')).ok, true)
})

test('rejects valid signature when exact configured public URL differs', async () => {
  const raw = 'CallSid=CA123'
  const signature = await expectedTwilioSignature(authToken, 'https://other.example.com/webhook/twilio/voice', { CallSid: 'CA123' })
  const req = new Request('https://internal.workers.dev/webhook/twilio/voice', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature }, body: raw,
  })
  const result = await verifyTwilioRequest(req, raw, authToken, 'https://voice.example.com')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'twilio_signature_invalid')
})

test('verifies JSON bodySHA256 before the Twilio URL signature', async () => {
  const raw = '{"CallSid":"CA123"}'
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))
  const hash = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const publicUrl = `https://voice.example.com/webhook/twilio/status?bodySHA256=${hash}`
  const signature = await expectedTwilioSignature(authToken, publicUrl)
  const req = new Request(`https://internal.workers.dev/webhook/twilio/status?bodySHA256=${hash}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Twilio-Signature': signature }, body: raw,
  })
  assert.equal((await verifyTwilioRequest(req, raw, authToken, 'https://voice.example.com')).ok, true)
  assert.equal((await verifyTwilioRequest(req, '{"CallSid":"CHANGED"}', authToken, 'https://voice.example.com')).reason, 'twilio_body_sha256_invalid')
})

test('Twilio handler remains fail-closed after successful signature validation', async () => {
  const raw = 'CallSid=CA123'
  const publicUrl = 'https://voice.example.com/webhook/twilio/voice'
  const signature = await expectedTwilioSignature(authToken, publicUrl, { CallSid: 'CA123' })
  const req = new Request('https://internal.workers.dev/webhook/twilio/voice', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature }, body: raw,
  })
  const response = await handleTwilioWebhook(req, {
    TWILIO_INGRESS_ENABLED: 'true', TWILIO_AUTH_TOKEN: authToken, TWILIO_PUBLIC_BASE_URL: 'https://voice.example.com',
  }, 'req-twilio')
  assert.equal(response.status, 503)
  const body = await response.json() as any
  assert.equal(body.verified, true)
  assert.equal(body.error, 'twilio_request_verified_but_routing_not_enabled')
})
