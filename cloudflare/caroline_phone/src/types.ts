export interface Env {
  ENVIRONMENT?: string
  CAROLINE_KEY?: string
  ELEVENLABS_WEBHOOK_SECRET?: string
  PHONE_TOOL_POLICY_JSON?: string
  TWILIO_AUTH_TOKEN?: string
  Caroline_Phone?: KVNamespace
  CAROLINE_PAYLOADS?: R2Bucket
  CAROLINE_EVENT_QUEUE?: Queue<QueuedEventPointer>
  CAROLINE_EVENT_DLQ?: Queue<QueuedEventPointer>
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
