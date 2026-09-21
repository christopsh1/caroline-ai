import type { Env } from '../types'

export interface ReceiptMetadata {
  source: string
  event_id: string
  event_type: string
  event_timestamp: string | number | null
  payload_sha256: string
  request_id: string
  delivered_at: string
  environment: string
}

function receiptKey(env: Env, eventId: string): string {
  return `receipt:${env.ENVIRONMENT ?? 'unknown'}:${eventId}`
}

export async function likelyAlreadyDelivered(env: Env, eventId: string): Promise<boolean> {
  if (!env.CAROLINE_PHONE) return false
  return (await env.CAROLINE_PHONE.get(receiptKey(env, eventId))) !== null
}

export async function recordReceipt(env: Env, metadata: ReceiptMetadata): Promise<void> {
  if (!env.CAROLINE_PHONE) return
  await env.CAROLINE_PHONE.put(receiptKey(env, metadata.event_id), JSON.stringify(metadata), {
    expirationTtl: 60 * 60 * 24 * 7,
  })
}
