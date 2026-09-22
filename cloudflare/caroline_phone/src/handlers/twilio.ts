import type { Env } from '../types.ts'
import { json } from '../lib/http.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { verifyTwilioRequest } from '../lib/twilio-security.ts'

const TWILIO_REQUEST_MAX_BYTES = 256 * 1024

export async function handleTwilioWebhook(req: Request, env: Env, requestId: string): Promise<Response> {
  if (env.TWILIO_INGRESS_ENABLED !== 'true') {
    return json({
      error: 'twilio_edge_ingress_not_enabled',
      reason: 'twilio_ingress_is_fail_closed_until_explicitly_enabled',
    }, 503, requestId)
  }

  let rawBody = ''
  if (req.method !== 'GET') {
    try { ({ rawBody } = await readBodyWithLimit(req, TWILIO_REQUEST_MAX_BYTES)) } catch (error) {
      if (error instanceof RequestBodyTooLargeError) return json({ error: 'payload_too_large' }, 413, requestId)
      throw error
    }
  }

  const verification = await verifyTwilioRequest(req, rawBody, env.TWILIO_AUTH_TOKEN, env.TWILIO_PUBLIC_BASE_URL)
  if (!verification.ok) {
    const configError = verification.reason?.endsWith('_not_configured')
    return json({ error: verification.reason ?? 'twilio_request_invalid' }, configError ? 503 : 401, requestId)
  }

  return json({
    error: 'twilio_request_verified_but_routing_not_enabled',
    verified: true,
  }, 503, requestId)
}
