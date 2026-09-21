import type { Env } from '../index'
import { json } from '../lib/http'
import { sha256Hex, verifyElevenLabsSignature } from '../lib/security'

type ElevenLabsEvent = { type?: unknown; event_timestamp?: unknown; data?: { conversation_id?: unknown; [key: string]: unknown }; [key: string]: unknown }

function safeEventId(event: ElevenLabsEvent, rawBodyHash: string): string {
  const type = typeof event.type === 'string' ? event.type : 'unknown'
  const ts = typeof event.event_timestamp === 'number' || typeof event.event_timestamp === 'string' ? String(event.event_timestamp) : 'unknown'
  const conversationId = typeof event.data?.conversation_id === 'string' ? event.data.conversation_id : 'unknown'
  return `${type}:${conversationId}:${ts}:${rawBodyHash.slice(0, 16)}`
}

async function recordReceipt(env: Env, eventId: string, event: ElevenLabsEvent, bodyHash: string): Promise<void> {
  if (!env.CAROLINE_PHONE) return
  const metadata = { source: 'elevenlabs', event_id: eventId, event_type: typeof event.type === 'string' ? event.type : null, event_timestamp: event.event_timestamp ?? null, conversation_id: typeof event.data?.conversation_id === 'string' ? event.data.conversation_id : null, body_sha256: bodyHash, received_at: new Date().toISOString() }
  await env.CAROLINE_PHONE.put(`receipt:elevenlabs:${eventId}`, JSON.stringify(metadata), { expirationTtl: 60 * 60 * 24 * 7 })
}

async function alreadyReceived(env: Env, eventId: string): Promise<boolean> {
  if (!env.CAROLINE_PHONE) return false
  return (await env.CAROLINE_PHONE.get(`receipt:elevenlabs:${eventId}`)) !== null
}

async function forwardEvent(req: Request, env: Env, rawBody: string, eventId: string): Promise<Response> {
  if (!env.EVENT_SINK_URL) return json({ error: 'event_sink_not_configured', event_id: eventId }, 503)
  const headers = new Headers({ 'Content-Type': req.headers.get('Content-Type') ?? 'application/json', 'X-Caroline-Source': 'elevenlabs', 'X-Caroline-Event-Id': eventId })
  const signature = req.headers.get('ElevenLabs-Signature')
  if (signature) headers.set('ElevenLabs-Signature', signature)
  if (env.EVENT_SINK_KEY) headers.set('x-caroline-key', env.EVENT_SINK_KEY)
  let upstream: Response
  try { upstream = await fetch(env.EVENT_SINK_URL, { method: 'POST', headers, body: rawBody }) } catch { return json({ error: 'event_sink_unreachable', event_id: eventId }, 502) }
  if (!upstream.ok) return json({ error: 'event_sink_rejected', event_id: eventId, upstream_status: upstream.status }, 502)
  return json({ ok: true, event_id: eventId })
}

export async function handleElevenLabsWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const rawBody = await req.text()
  const verification = await verifyElevenLabsSignature(rawBody, req.headers.get('ElevenLabs-Signature'), env.ELEVENLABS_WEBHOOK_SECRET)
  if (!verification.ok) return json({ error: verification.reason }, verification.reason === 'webhook_secret_not_configured' ? 503 : 401)
  let event: ElevenLabsEvent
  try { event = JSON.parse(rawBody) as ElevenLabsEvent } catch { return json({ error: 'invalid_json' }, 400) }
  if (typeof event.type !== 'string' || !event.type) return json({ error: 'event_type_required' }, 400)
  const bodyHash = await sha256Hex(rawBody)
  const eventId = safeEventId(event, bodyHash)
  if (await alreadyReceived(env, eventId)) return json({ ok: true, duplicate: true, event_id: eventId })
  const delivered = await forwardEvent(req, env, rawBody, eventId)
  if (delivered.ok) await recordReceipt(env, eventId, event, bodyHash)
  return delivered
}
