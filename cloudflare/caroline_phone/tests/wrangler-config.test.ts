import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('wrangler config binds Durable Object, delivery queue, DLQ, and keeps secrets out of vars', () => {
  const text=readFileSync(new URL('../wrangler.toml', import.meta.url).pathname,'utf8')
  assert.match(text,/\[exports\.CarolineSession\][\s\S]*storage = "sqlite"/)
  assert.match(text,/\[\[env\.dev\.durable_objects\.bindings\]\][\s\S]*name = "CAROLINE_SESSIONS"/)
  assert.match(text,/binding = "Caroline_Phone"[\s\S]*85679a0030e846ee931226aa1a6e6332/)
  assert.match(text,/binding = "CAROLINE_EVENT_QUEUE"[\s\S]*queue = "caroline-event-delivery"/)
  assert.match(text,/binding = "CAROLINE_EVENT_DLQ"[\s\S]*queue = "caroline-event-dlq"/)
  assert.match(text,/queue = "caroline-event-delivery"[\s\S]*max_batch_size = 10[\s\S]*max_batch_timeout = 5[\s\S]*max_retries = 3[\s\S]*dead_letter_queue = "caroline-event-dlq"/)
  assert.doesNotMatch(text,/CAROLINE_EVENTS|caroline-phone-events/)
  assert.doesNotMatch(text,/CORE_RUNTIME_URL|CORE_RUNTIME_KEY|EVENT_SINK_URL|EVENT_SINK_KEY/)
})
