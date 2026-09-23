import type { Env } from '../types.ts'

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
  return `receipt-cache:${env.ENVIRONMENT ?? 'unknown'}:${eventId}`
}

// KV is only a diagnostic/cache copy. It must never decide whether an event is
// accepted, authorized, retried, or treated as exactly-once.
export async function recordReceiptCache(env: Env, metadata: ReceiptMetadata): Promise<void> {
  if (!env.CAROLINE_PHONE) return
  await env.CAROLINE_PHONE.put(receiptKey(env, metadata.event_id), JSON.stringify(metadata), { expirationTtl: 60 * 60 * 24 * 7 })
}
