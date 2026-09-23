export interface Env {
  TWILIO_ACCOUNT_SID: string
  TWILIO_API_KEY_SID: string
  TWILIO_API_KEY_SECRET: string
  TWILIO_FROM_NUMBER: string
  TWILIO_AUTH_TOKEN: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_AGENT_ID: string
  ELEVENLABS_AGENT_PHONE_NUMBER_ID: string
  OUTBOUND_API_TOKEN?: string
  CAROLINE_KEY?: string
}

export interface OutboundCallRequest {
  to: string
  first_message?: string
  metadata?: Record<string, unknown>
}

export interface ElevenLabsOutboundResponse {
  success?: boolean
  conversation_id?: string | null
  callSid?: string | null
}

export type OperationalStatus =
  | 'received'
  | 'verified'
  | 'registered'
  | 'accepted'
  | 'rejected'
  | 'upstream_timeout'
  | 'upstream_error'

export interface OperationalLog {
  route: string
  request_id: string
  call_sid?: string
  status: OperationalStatus | string
}
