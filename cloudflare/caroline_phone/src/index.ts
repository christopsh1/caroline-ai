import { handleElevenLabsWebhook } from './handlers/elevenlabs'
import { handleStatus } from './handlers/status'
import { handleTwilioWebhook } from './handlers/twilio'
import { json } from './lib/http'
import { verifyRuntimeKey } from './lib/security'

export interface Env {
  CAROLINE_RUNTIME_KEY?: string
  ELEVENLABS_WEBHOOK_SECRET?: string
  EVENT_SINK_URL?: string
  EVENT_SINK_KEY?: string
  CAROLINE_PHONE?: KVNamespace
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/health' && req.method === 'GET') return json({ ok: true, service: 'caroline_phone', release: '3.0.0' })
    if (url.pathname === '/status' && req.method === 'GET') {
      if (!verifyRuntimeKey(req, env.CAROLINE_RUNTIME_KEY)) return json({ error: 'unauthorized' }, 401)
      return handleStatus(env)
    }
    if (url.pathname === '/webhook/elevenlabs') return handleElevenLabsWebhook(req, env)
    if (url.pathname.startsWith('/webhook/twilio')) return handleTwilioWebhook()
    return json({ error: 'not_found' }, 404)
  },
}
