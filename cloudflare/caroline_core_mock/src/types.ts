export interface Env {
  ENVIRONMENT?: string
  CORE_RUNTIME_KEY?: string
  EVENT_SINK_KEY?: string
  MOCK_CALLER_PROFILES_JSON?: string
  MOCK_STATE?: R2Bucket
}

export type CoreOperation =
  | 'init'
  | 'retrieve'
  | 'phone_contact_resolve'
  | 'phone_sms'
  | 'phone_calendar_read'
  | 'phone_hold'
  | 'phone_reentry_ack'

export interface EdgeCoreRequest {
  schema_version: '1'
  request_id: string
  environment: string
  operation: CoreOperation
  received_at: string
  input: Record<string, unknown>
}

export interface MockSession {
  schema_version: '1'
  conversation_id: string
  caller_id: string
  identity_status: string
  access_tier: string
  tone_profile: string
  persona_profile_json: string
  relationship_context: string
  permissions_json: string
  calendar_share_level: 'none' | 'busy_only' | 'title' | 'details'
  call_answering_status: 'allowed' | 'restricted' | 'restricted_by_owner' | 'banned' | 'waitlisted'
  call_reentry_notice_pending: boolean
  bio_short: string
  created_at: string
  updated_at: string
}
