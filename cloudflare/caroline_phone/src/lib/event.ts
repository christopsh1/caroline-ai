export interface SourceEventShape {
  type?: unknown
  event_timestamp?: unknown
  data?: {
    conversation_id?: unknown
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function deterministicEventId(event: SourceEventShape, rawBodyHash: string): string {
  const type = typeof event.type === 'string' ? event.type : 'unknown'
  const ts = typeof event.event_timestamp === 'number' || typeof event.event_timestamp === 'string'
    ? String(event.event_timestamp)
    : 'unknown'
  const conversationId = typeof event.data?.conversation_id === 'string'
    ? event.data.conversation_id
    : 'unknown'
  return `${type}:${conversationId}:${ts}:${rawBodyHash.slice(0, 24)}`
}
