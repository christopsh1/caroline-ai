import assert from 'node:assert/strict'
import test from 'node:test'
import { deterministicEventId } from '../src/lib/event.ts'
import { readBodyWithLimit, RequestBodyTooLargeError } from '../src/lib/request.ts'

test('event id is deterministic and source-derived', () => {
  const event = {
    type: 'post_call_transcription',
    event_timestamp: 1739537297,
    data: { conversation_id: 'conv_123' },
  }
  assert.equal(
    deterministicEventId(event, 'abcdef0123456789abcdef0123456789'),
    'post_call_transcription:conv_123:1739537297:abcdef0123456789abcdef01',
  )
})

test('body reader enforces the actual byte limit', async () => {
  const req = new Request('https://example.test/webhook', { method: 'POST', body: '12345' })
  await assert.rejects(() => readBodyWithLimit(req, 4), RequestBodyTooLargeError)
})
