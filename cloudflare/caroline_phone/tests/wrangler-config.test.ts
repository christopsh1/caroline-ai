import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('wrangler config binds the fresh Caroline Worker inventory and keeps secret values out of vars', () => {
  const text=readFileSync(new URL('../wrangler.toml', import.meta.url).pathname,'utf8')
  assert.match(text,/name = "caroline-event-worker"/)
  assert.match(text,/\[exports\.CarolineSession\][\s\S]*storage = "sqlite"/)
  assert.match(text,/\[\[durable_objects\.bindings\]\][\s\S]*name = "CAROLINE_SESSIONS"/)
  assert.match(text,/binding = "CAROLINE_PHONE"[\s\S]*85679a0030e846ee931226aa1a6e6332/)
  assert.match(text,/binding = "CAROLINE_EVENTS_RAW"[\s\S]*bucket_name = "caroline-events-raw"/)
  assert.match(text,/binding = "CAROLINE_TRANSCRIPTS"[\s\S]*bucket_name = "caroline-transcripts"/)
  assert.match(text,/binding = "CAROLINE_ARTIFACTS"[\s\S]*bucket_name = "caroline-artifacts"/)
  assert.match(text,/binding = "CAROLINE_MEDIA"[\s\S]*bucket_name = "caroline-media"/)
  assert.match(text,/binding = "CAROLINE_DB"[\s\S]*database_id = "e350a176-c2be-4b5c-9975-bebb157e944a"/)
  assert.match(text,/binding = "EVENT_DELIVERY"[\s\S]*queue = "caroline-event-delivery"/)
  const vars = text.match(/\[vars\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? ''
  assert.doesNotMatch(vars,/CAROLINE_KEY|CORE_RUNTIME_KEY|ELEVENLABS_WEBHOOK_SECRET|TWILIO_AUTH_TOKEN|OPEN_ROUTER_KEY/)
  assert.doesNotMatch(text,/binding = "Caroline_Phone"|binding = "CAROLINE_PAYLOADS"|binding = "CAROLINE_EVENT_QUEUE"/)
})
