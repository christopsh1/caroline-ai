import { handleElevenLabsWebhook } from './handlers/elevenlabs.ts'
import { handleRuntimeInit } from './handlers/runtime-init.ts'
import { handleRuntimeRetrieve } from './handlers/runtime-retrieve.ts'
import { handleStatus } from './handlers/status.ts'
import { handleTwilioWebhook } from './handlers/twilio.ts'
import { consumeEventBatch } from './lib/consumer.ts'
import { json, requestIdFor, withRequestId } from './lib/http.ts'
import { log } from './lib/log.ts'
import { verifyRuntimeKey } from './lib/security.ts'
import type { Env, QueuedEventPointer } from './types.ts'

export type { Env } from './types.ts'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const requestId = requestIdFor(req)
    const url = new URL(req.url)
    try {
      if (url.pathname === '/health' && req.method === 'GET') {
        return json({ ok: true, service: 'caroline_phone', release: '3.3.0' }, 200, requestId)
      }
      if (url.pathname === '/status' && req.method === 'GET') {
        if (!verifyRuntimeKey(req, env.CAROLINE_RUNTIME_KEY)) return json({ error: 'unauthorized' }, 401, requestId)
        return handleStatus(env, requestId)
      }
      if (url.pathname === '/runtime/init') return await handleRuntimeInit(req, env, requestId)
      if (url.pathname === '/runtime/retrieve') return await handleRuntimeRetrieve(req, env, requestId)
      if (url.pathname === '/webhook/elevenlabs') return await handleElevenLabsWebhook(req, env, requestId)
      if (url.pathname.startsWith('/webhook/twilio')) return handleTwilioWebhook(env, requestId)
      return json({ error: 'not_found' }, 404, requestId)
    } catch (error) {
      log('error', 'unhandled_request_error', {
        request_id: requestId,
        path: url.pathname,
        method: req.method,
        error_name: error instanceof Error ? error.name : 'unknown',
      })
      return withRequestId(json({ error: 'internal_error' }, 500), requestId)
    }
  },

  async queue(batch: MessageBatch<QueuedEventPointer>, env: Env): Promise<void> {
    await consumeEventBatch(batch, env)
  },
}
