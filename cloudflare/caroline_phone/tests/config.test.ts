import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')

test('caroline-phone is a separate Worker with a SQLite Durable Object', () => {
  assert.match(wrangler, /name = "caroline-phone"/)
  assert.match(wrangler, /name = "CALL_SESSIONS"/)
  assert.match(wrangler, /class_name = "CallSession"/)
  assert.match(wrangler, /\[exports\.CallSession\]/)
  assert.match(wrangler, /storage = "sqlite"/)
})

test('wrangler contains no Twilio phone number or provider secret values', () => {
  assert.doesNotMatch(wrangler, /TWILIO_PHONE_NUMBER\s*=/)
  assert.doesNotMatch(wrangler, /TWILIO_AUTH_TOKEN\s*=/)
  assert.doesNotMatch(wrangler, /ELEVENLABS_API_KEY\s*=/)
  assert.doesNotMatch(wrangler, /\+[1-9]\d{9,14}/)
})
