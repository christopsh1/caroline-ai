import type { CarolineEventEnvelope, Env } from '../types.ts'

export const PENDING_NEON_INTEGRATION = 'PENDING_NEON_INTEGRATION' as const

export type CanonicalPending = {
  status: 'pending_neon'
  integration: typeof PENDING_NEON_INTEGRATION
}

export type CanonicalReady<T> = { status: 'ready'; value: T }
export type CanonicalResult<T> = CanonicalReady<T> | CanonicalPending

export interface CanonicalCallerProfile {
  identity_status: string
  access_tier: string
  tone_profile: string
  relationship_context: string
  recent_history: string
  active_instructions: string
  availability_status: string
  calendar_share_level: 'none' | 'busy_only' | 'title' | 'details'
  calendar_current_activity: string
  calendar_next_event: string
  outbound_call_brief_json: string
  persona_profile_json: string
  session_energy: string
  call_answering_status: string
  call_answering_reason: string
  reentry_notice_pending: boolean
  bio_short: string
  extended_bio: string
  persona_facts: string
  telegram_chat_id: string
  outbound_authorization_status: 'owner_authorized' | 'not_authorized'
  first_message?: string
}

export interface CanonicalPermissions {
  permissions_json: string
  can_retrieve: boolean
  can_resolve_contacts: boolean
  can_send_sms: boolean
  can_hold_current_session: boolean
  can_ack_reentry: boolean
  calendar_share_level: 'none' | 'busy_only' | 'title' | 'details'
}

export interface CanonicalRagContext {
  context: string
  results: Array<{ text: string; type?: string; timestamp?: string }>
}

export interface CanonicalConfig {
  revision: string
}

export interface CanonicalContactResolution {
  unique: boolean
  candidates: Array<{ display_name: string; phone: string; contact_ref?: string }>
}

export interface CanonicalSmsResult {
  accepted: boolean
  disposition: 'sent' | 'scheduled' | 'queued' | 'rejected'
  execute_at?: string
}

export interface CanonicalCalendarResult {
  share_level: 'none' | 'busy_only' | 'title' | 'details'
  events: Array<Record<string, unknown>>
}

export interface CanonicalEventDelivery {
  status: number
}

function pending<T>(): CanonicalResult<T> {
  return { status: 'pending_neon', integration: PENDING_NEON_INTEGRATION }
}

// PENDING_NEON_INTEGRATION: canonical identity must come from Neon once Neon exists.
export async function getCanonicalCallerProfile(_env: Env, _input: Record<string, unknown>): Promise<CanonicalResult<CanonicalCallerProfile>> {
  return pending()
}

// PENDING_NEON_INTEGRATION: disclosure/action permissions must come from Neon once Neon exists.
export async function getCanonicalPermissions(_env: Env, _input: Record<string, unknown>): Promise<CanonicalResult<CanonicalPermissions>> {
  return pending()
}

// PENDING_NEON_INTEGRATION: RAG/memory retrieval must come from Neon once Neon exists.
export async function getCanonicalRagContext(_env: Env, _input: Record<string, unknown>): Promise<CanonicalResult<CanonicalRagContext>> {
  return pending()
}

// PENDING_NEON_INTEGRATION: canonical cross-system config must come from Neon once Neon exists.
export async function loadCanonicalConfig(_env: Env): Promise<CanonicalResult<CanonicalConfig>> {
  return pending()
}

// PENDING_NEON_INTEGRATION: contact resolution is not faked at the edge.
export async function resolveCanonicalContact(_env: Env, _input: Record<string, unknown>): Promise<CanonicalResult<CanonicalContactResolution>> {
  return pending()
}

// PENDING_NEON_INTEGRATION: SMS persistence/authorization/provider execution is not faked at the edge.
export async function sendCanonicalSms(_env: Env, _input: Record<string, unknown>): Promise<CanonicalResult<CanonicalSmsResult>> {
  return pending()
}

// PENDING_NEON_INTEGRATION: calendar data is not invented at the edge.
export async function getCanonicalCalendar(_env: Env, _input: Record<string, unknown>): Promise<CanonicalResult<CanonicalCalendarResult>> {
  return pending()
}

// PENDING_NEON_INTEGRATION: event delivery remains retryable until a canonical sink exists.
export async function deliverCanonicalEvent(_env: Env, _envelope: CarolineEventEnvelope): Promise<CanonicalResult<CanonicalEventDelivery>> {
  return pending()
}
