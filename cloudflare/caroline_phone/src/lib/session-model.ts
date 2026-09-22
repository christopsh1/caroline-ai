import { PENDING_NEON_INTEGRATION } from './canonical.ts'

export type SessionRole = 'owner' | 'external' | 'unknown'
export type SessionInteractionMode = 'inbound_owner' | 'inbound_external' | 'outbound' | 'unknown'
export type CalendarShareLevel = 'none' | 'busy_only' | 'title' | 'details'
export type SessionPhoneAction = 'contact-resolve' | 'sms' | 'calendar-read' | 'hold' | 'reentry-ack'

export interface SessionPermissionSnapshot {
  can_retrieve: boolean
  can_resolve_contacts: boolean
  can_send_sms: boolean
  can_hold_current_session: boolean
  can_ack_reentry: boolean
  calendar_share_level: CalendarShareLevel
}

export interface CarolineSessionState {
  schema_version: '1'
  conversation_id: string
  created_at: string
  updated_at: string
  interaction_mode: SessionInteractionMode
  caller_binding_hash?: string
  role: SessionRole
  identity_status: string
  access_tier: string
  call_answering_status: string
  reentry_notice_pending: boolean
  permission_snapshot: SessionPermissionSnapshot
  tool_ids: string[]
  hold: {
    active: boolean
    reason_code?: string
    reason_summary?: string
    updated_at?: string
  }
  canonical: {
    caller_profile: 'ready' | 'pending_neon'
    permissions: 'ready' | 'pending_neon'
    rag: 'ready' | 'pending_neon'
    config: 'ready' | 'pending_neon'
    marker: typeof PENDING_NEON_INTEGRATION | ''
  }
}

export function denyAllPermissions(): SessionPermissionSnapshot {
  return {
    can_retrieve: false,
    can_resolve_contacts: false,
    can_send_sms: false,
    can_hold_current_session: false,
    can_ack_reentry: false,
    calendar_share_level: 'none',
  }
}

export function createPendingNeonSession(input: {
  conversation_id: string
  interaction_mode: SessionInteractionMode
  caller_binding_hash?: string
  tool_ids?: string[]
  now?: string
}): CarolineSessionState {
  const now = input.now ?? new Date().toISOString()
  return {
    schema_version: '1',
    conversation_id: input.conversation_id,
    created_at: now,
    updated_at: now,
    interaction_mode: input.interaction_mode,
    ...(input.caller_binding_hash ? { caller_binding_hash: input.caller_binding_hash } : {}),
    role: 'unknown',
    identity_status: 'unknown',
    access_tier: 'tier_0_unknown_unverified',
    call_answering_status: 'canonical_pending',
    reentry_notice_pending: false,
    permission_snapshot: denyAllPermissions(),
    tool_ids: [...new Set(input.tool_ids ?? [])].slice(0, 64),
    hold: { active: false },
    canonical: {
      caller_profile: 'pending_neon',
      permissions: 'pending_neon',
      rag: 'pending_neon',
      config: 'pending_neon',
      marker: PENDING_NEON_INTEGRATION,
    },
  }
}

export function isSessionState(value: unknown): value is CarolineSessionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const s = value as Partial<CarolineSessionState>
  return s.schema_version === '1'
    && typeof s.conversation_id === 'string'
    && s.conversation_id.length > 0
    && typeof s.created_at === 'string'
    && typeof s.updated_at === 'string'
    && (s.role === 'owner' || s.role === 'external' || s.role === 'unknown')
    && typeof s.call_answering_status === 'string'
    && Boolean(s.permission_snapshot)
    && Array.isArray(s.tool_ids)
    && Boolean(s.hold)
    && Boolean(s.canonical)
}

export function canRunPhoneAction(session: CarolineSessionState, action: SessionPhoneAction): boolean {
  if (session.call_answering_status !== 'allowed') return false
  switch (action) {
    case 'contact-resolve': return session.role === 'owner' && session.permission_snapshot.can_resolve_contacts
    case 'sms': return session.role === 'owner' && session.permission_snapshot.can_send_sms
    case 'calendar-read': return session.permission_snapshot.calendar_share_level !== 'none'
    case 'hold': return session.role !== 'owner' && session.permission_snapshot.can_hold_current_session
    case 'reentry-ack': return session.reentry_notice_pending && session.permission_snapshot.can_ack_reentry
  }
}

export function applyCurrentSessionHold(
  session: CarolineSessionState,
  reasonCode?: string,
  reasonSummary?: string,
  now = new Date().toISOString(),
): CarolineSessionState | null {
  if (!canRunPhoneAction(session, 'hold')) return null
  return {
    ...session,
    updated_at: now,
    hold: {
      active: true,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
      ...(reasonSummary ? { reason_summary: reasonSummary } : {}),
      updated_at: now,
    },
  }
}

export function applyReentryAcknowledgement(
  session: CarolineSessionState,
  now = new Date().toISOString(),
): CarolineSessionState | null {
  if (!canRunPhoneAction(session, 'reentry-ack')) return null
  return {
    ...session,
    updated_at: now,
    reentry_notice_pending: false,
  }
}
