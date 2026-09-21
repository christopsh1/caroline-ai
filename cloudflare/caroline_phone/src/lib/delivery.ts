import type { CarolineEventEnvelope, Env } from '../types'
import { signCarolinePayload } from './security'

export type DeliveryResult =
  | { ok: true; status: number }
  | { ok: false; reason: 'sink_not_configured' | 'sink_auth_not_configured' | 'sink_url_invalid' | 'sink_unreachable' | 'sink_rejected'; status?: number }

export async function deliverEvent(env: Env, envelope: CarolineEventEnvelope): Promise<DeliveryResult> {
  if (!env.EVENT_SINK_URL) return { ok: false, reason: 'sink_not_configured' }
  if (!env.EVENT_SINK_KEY) return { ok: false, reason: 'sink_auth_not_configured' }

  let url: URL
  try {
    url = new URL(env.EVENT_SINK_URL)
  } catch {
    return { ok: false, reason: 'sink_url_invalid' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'sink_url_invalid' }

  const body = JSON.stringify(envelope)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signCarolinePayload(body, env.EVENT_SINK_KEY, timestamp)

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Caroline-Source': envelope.source,
        'X-Caroline-Event-Id': envelope.event_id,
        'X-Caroline-Request-Id': envelope.request_id,
        'X-Caroline-Signature': signature,
      },
      body,
    })
  } catch {
    return { ok: false, reason: 'sink_unreachable' }
  }

  if (!upstream.ok) return { ok: false, reason: 'sink_rejected', status: upstream.status }
  return { ok: true, status: upstream.status }
}
