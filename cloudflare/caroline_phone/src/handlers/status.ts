import type { Env } from '../types'
import { json } from '../lib/http'

export function handleStatus(env: Env, requestId: string): Response {
  return json({
    ok: true,
    service: 'caroline_phone',
    release: '3.1.0',
    role: 'cloudflare_edge',
    environment: env.ENVIRONMENT ?? 'unknown',
    configured: {
      runtime_key: Boolean(env.CAROLINE_RUNTIME_KEY),
      elevenlabs_webhook_secret: Boolean(env.ELEVENLABS_WEBHOOK_SECRET),
      caroline_phone_kv: Boolean(env.CAROLINE_PHONE),
      event_sink: Boolean(env.EVENT_SINK_URL),
      event_sink_auth: Boolean(env.EVENT_SINK_KEY),
      twilio_auth_token: Boolean(env.TWILIO_AUTH_TOKEN),
      twilio_public_base_url: Boolean(env.TWILIO_PUBLIC_BASE_URL),
    },
    routes: {
      elevenlabs: 'verified_ingress',
      twilio: env.TWILIO_INGRESS_ENABLED === 'true' ? 'blocked_until_validator_is_wired' : 'disabled_fail_closed',
      generic_webhook: 'not_exposed',
      generic_proxy: 'not_exposed',
    },
    guarantees: {
      source_authentication: 'hmac',
      downstream_authentication: 'caroline_hmac',
      kv_role: 'receipt_metadata_only_not_strict_idempotency',
      raw_payload_logging: false,
    },
  }, 200, requestId)
}
