import type { Env } from '../types.ts'
import { json } from '../lib/http.ts'
import { asyncPipelineReady } from '../lib/staging.ts'
import { PENDING_NEON_INTEGRATION } from '../lib/canonical.ts'

export function handleStatus(env: Env, requestId: string): Response {
  const sessionStoreReady = Boolean(env.CAROLINE_SESSIONS)
  const requestAuthReady = Boolean(env.CAROLINE_KEY)
  const asyncCaptureReady = Boolean(env.ELEVENLABS_WEBHOOK_SECRET) && asyncPipelineReady(env)

  return json({
    ok: true,
    service: 'caroline_phone',
    release: '3.10.0',
    role: 'cloudflare_phone_runtime_boundary',
    environment: env.ENVIRONMENT ?? 'unknown',
    ready: {
      request_auth: requestAuthReady,
      durable_session_store: sessionStoreReady,
      call_init_orchestration: requestAuthReady && sessionStoreReady,
      elevenlabs_event_capture: asyncCaptureReady,
      twilio_signature_validation: Boolean(env.TWILIO_AUTH_TOKEN),
      canonical_backend: false,
    },
    configured: {
      runtime_key: requestAuthReady,
      durable_sessions: sessionStoreReady,
      phone_tool_policy: Boolean(env.PHONE_TOOL_POLICY_JSON),
      elevenlabs_webhook_secret: Boolean(env.ELEVENLABS_WEBHOOK_SECRET),
      caroline_phone_kv: Boolean(env.Caroline_Phone),
      payload_r2: Boolean(env.CAROLINE_PAYLOADS),
      event_delivery_queue: Boolean(env.CAROLINE_EVENT_QUEUE),
      event_dlq_binding: Boolean(env.CAROLINE_EVENT_DLQ),
      twilio_auth_token: Boolean(env.TWILIO_AUTH_TOKEN),
    },
    pending_integrations: {
      neon_canonical_data: PENDING_NEON_INTEGRATION,
      canonical_event_delivery: PENDING_NEON_INTEGRATION,
    },
    storage_roles: {
      worker_code: 'request_validation_orchestration_policy_safe_fallback',
      durable_object_storage: 'authoritative_active_session_truth',
      kv: 'noncritical_cache_config_telemetry_only',
      r2: 'verified_event_payload_staging',
      queue: 'event_pointer_retry_transport',
      neon: 'pending_canonical_identity_permissions_rag_actions_and_cross_session_state',
    },
    guarantees: {
      active_call_truth_in_kv: false,
      permission_truth_in_kv: false,
      mutable_global_session_state: false,
      raw_payload_logging: false,
      raw_header_logging: false,
      unverified_call_tool_surface: 'empty',
    },
  }, 200, requestId)
}
