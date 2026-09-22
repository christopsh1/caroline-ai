import type { Env } from '../types.ts'
import { json } from '../lib/http.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { verifyTwilioRequest } from '../lib/twilio-security.ts'

const TWILIO_REQUEST_MAX_BYTES = 256 * 1024
const COUNTER_TTL_SECONDS = 8 * 24 * 60 * 60

async function incrementRejectedCounter(env: Env): Promise<void> {
  const kv = env.Caroline_Phone
  if (!kv) return
  const hour = new Date().toISOString().slice(0, 13)
  const key = `security:${env.ENVIRONMENT ?? 'unknown'}:twilio_rejected:${hour}`
  try {
    const previous = Number(await kv.get(key) ?? '0')
    const next = Number.isFinite(previous) && previous >= 0 ? previous + 1 : 1
    await kv.put(key, String(next), { expirationTtl: COUNTER_TTL_SECONDS })
  } catch {
    // Security telemetry is best-effort; never emit request/auth details to logs.
  }
}

export async function handleTwilioWebhook(req: Request, env: Env, requestId: string): Promise<Response> {
  let rawBody = ''
  if (req.method !== 'GET') {
    try { ({ rawBody } = await readBodyWithLimit(req, TWILIO_REQUEST_MAX_BYTES)) } catch (error) {
      if (error instanceof RequestBodyTooLargeError) return json({ error: 'payload_too_large' }, 413, requestId)
      throw error
    }
  }

  if (!(await verifyTwilioRequest(req, rawBody, env.TWILIO_AUTH_TOKEN))) {
    await incrementRejectedCounter(env)
    return json({ error: 'forbidden' }, 403, requestId)
  }

  return json({ error: 'twilio_routing_not_enabled' }, 503, requestId)
}
