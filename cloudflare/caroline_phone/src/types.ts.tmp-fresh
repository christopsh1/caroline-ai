export interface Env {
  ENVIRONMENT?: string
  CAROLINE_KEY?: string
  CORE_RUNTIME_KEY?: string
  ELEVENLABS_WEBHOOK_SECRET?: string
  PHONE_TOOL_POLICY_JSON?: string
  TWILIO_AUTH_TOKEN?: string
  OPEN_ROUTER_KEY?: string
  CAROLINE_PHONE?: KVNamespace
  CAROLINE_EVENTS_RAW?: R2Bucket
  CAROLINE_TRANSCRIPTS?: R2Bucket
  CAROLINE_ARTIFACTS?: R2Bucket
  CAROLINE_MEDIA?: R2Bucket
  CAROLINE_DB?: D1Database
  EVENT_DELIVERY?: Queue<QueuedEventPointer>
  CAROLINE_SESSIONS?: DurableObjectNamespace
}

export type EventSource = 'elevenlabs'

export interface CarolineEventEnvelope<T = unknown> {
  schema_version: '1'
  event_id: string
  request_id: string
  environment: string
  source: EventSource
  source_event_type: string
  source_event_timestamp: string | number | null
  received_at: string
  payload_sha256: string
  payload: T
}

export interface QueuedEventPointer {
  schema_version: '1'
  event_id: string
  request_id: string
  environment: string
  source: EventSource
  source_event_type: string
  received_at: string
  object_key: string
  envelope_sha256: string
}
