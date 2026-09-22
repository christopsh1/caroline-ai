import type { Env } from '../types.ts'
import { json } from '../lib/http.ts'
import { sinkReady } from '../lib/delivery.ts'
import { asyncPipelineReady } from '../lib/staging.ts'

function coreRuntimeReady(env: Env): boolean {
  if (!env.CORE_RUNTIME_URL || !env.CORE_RUNTIME_KEY) return false
  try { return new URL(env.CORE_RUNTIME_URL).protocol === 'https:' } catch { return false }
}

export function handleStatus(env: Env, requestId: string): Response {
  return json({
    ok: true,
    service: 'caroline_phone',
    release: '3.9.0',
    role: 'cloudflare_edge_runtime_facade',
    environment: env.ENVIRONMENT ?? 'unknown',
    ready: {
      runtime_facade: Boolean(env.CAROLINE_KEY) && coreRuntimeReady(env),
      async_pipeline: asyncPipelineReady(env),
      event_sink: sinkReady(env),
      elevenlabs_event_ingress: Boolean(env.ELEVENLABS_WEBHOOK_SECRET) && asyncPipelineReady(env) && sinkReady(env),
      twilio_signature_validation: Boolean(env.TWILIO_AUTH_TOKEN),
    },
    configured: {
      runtime_key: Boolean(env.CAROLINE_KEY),
      core_runtime: Boolean(env.CORE_RUNTIME_URL),
      core_runtime_auth: Boolean(env.CORE_RUNTIME_KEY),
      phone_tool_policy: Boolean(env.PHONE_TOOL_POLICY_JSON),
      elevenlabs_webhook_secret: Boolean(env.ELEVENLABS_WEBHOOK_SECRET),
      caroline_phone_kv: Boolean(env.Caroline_Phone),
      payload_r2: Boolean(env.CAROLINE_PAYLOADS),
      events_queue: Boolean(env.CAROLINE_EVENTS),
      event_sink: Boolean(env.EVENT_SINK_URL),
      event_sink_auth: Boolean(env.EVENT_SINK_KEY),
      twilio_auth_token: Boolean(env.TWILIO_AUTH_TOKEN),
    },
    routes: {
      runtime_init: 'authenticated_whitelist_facade',
      runtime_retrieve: 'authenticated_sanitizing_facade',
      elevenlabs_events: 'verified_ingress_async_delivery',
      twilio: 'signature_validation_active_routing_disabled',
      generic_webhook: 'not_exposed',
      generic_proxy: 'not_exposed',
    },
    guarantees: {
      provider_event_authentication: 'hmac',
      core_request_authentication: 'caroline_hmac',
      core_response_authentication: 'caroline_hmac',
      init_override_surface: 'dynamic_variables_tool_ids_first_message_only',
      queue_payload: 'pointer_only',
      payload_store: 'r2_strong_consistency',
      kv_role: 'receipt_and_security_counter_metadata_only_not_strict_idempotency',
      raw_payload_logging: false,
      raw_header_logging: false,
    },
  }, 200, requestId)
}
