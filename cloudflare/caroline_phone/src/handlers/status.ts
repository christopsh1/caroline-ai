import type { Env } from '../index'
import { json } from '../lib/http'

export function handleStatus(env: Env): Response {
  return json({
    ok: true,
    service: 'caroline_phone',
    release: '3.0.0',
    role: 'cloudflare_edge',
    configured: {
      runtime_key: Boolean(env.CAROLINE_RUNTIME_KEY),
      elevenlabs_webhook_secret: Boolean(env.ELEVENLABS_WEBHOOK_SECRET),
      caroline_phone_kv: Boolean(env.CAROLINE_PHONE),
      event_sink: Boolean(env.EVENT_SINK_URL),
      event_sink_auth: Boolean(env.EVENT_SINK_KEY),
    },
    routes: {
      elevenlabs: 'verified_ingress',
      twilio: 'disabled_fail_closed',
      generic_webhook: 'not_exposed',
      generic_proxy: 'not_exposed',
    },
  })
}
