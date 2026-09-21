import { json } from '../lib/http'

export function handleTwilioWebhook(): Response {
  return json({ error: 'twilio_edge_ingress_not_enabled', reason: 'configure_exact_cloudflare_callback_and_official_twilio_request_validation_before_enablement' }, 503)
}
