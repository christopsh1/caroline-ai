import type { Env } from '../types'
import { json } from '../lib/http'

export function handleTwilioWebhook(env: Env, requestId: string): Response {
  const enabled = env.TWILIO_INGRESS_ENABLED === 'true'
  return json(
    {
      error: 'twilio_edge_ingress_not_enabled',
      configured_enabled_flag: enabled,
      reason: 'wire_supported_twilio_request_validator_against_exact_public_callback_url_before_enablement',
    },
    503,
    requestId,
  )
}
