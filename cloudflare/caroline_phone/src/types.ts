export interface Env {
  ENVIRONMENT?: string
  CAROLINE_RUNTIME_KEY?: string
  ELEVENLABS_WEBHOOK_SECRET?: string
  EVENT_SINK_URL?: string
  EVENT_SINK_KEY?: string
  CORE_RUNTIME_URL?: string
  CORE_RUNTIME_KEY?: string
  PHONE_TOOL_POLICY_JSON?: string
  TWILIO_INGRESS_ENABLED?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_PUBLIC_BASE_URL?: string
  CAROLINE_PHONE?: KVNamespace
  CAROLINE_PAYLOADS?: R2Bucket
  CAROLINE_EVENTS?: Queue<QueuedEventPointer>
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
