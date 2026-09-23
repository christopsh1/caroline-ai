import assert from 'node:assert/strict'
import test from 'node:test'
import { PENDING_NEON_INTEGRATION } from '../src/lib/canonical.ts'
import { applyCurrentSessionHold, applyReentryAcknowledgement, canRunPhoneAction, createPendingNeonSession, type CarolineSessionState } from '../src/lib/session-model.ts'

test('pending-Neon sessions fail closed and persist explicit integration state', () => {
  const session = createPendingNeonSession({ conversation_id: 'c1', interaction_mode: 'inbound_external', caller_binding_hash: 'hash', tool_ids: ['should-be-recorded'] , now: '2026-09-22T00:00:00Z' })
  assert.equal(session.call_answering_status, 'canonical_pending')
  assert.equal(session.role, 'unknown')
  assert.equal(session.permission_snapshot.can_retrieve, false)
  assert.equal(canRunPhoneAction(session, 'sms'), false)
  assert.equal(session.canonical.marker, PENDING_NEON_INTEGRATION)
})

test('session-local hold mutates a durable snapshot only when code-level permission allows it', () => {
  const base = createPendingNeonSession({ conversation_id: 'c2', interaction_mode: 'inbound_external', now: '2026-09-22T00:00:00Z' })
  const allowed: CarolineSessionState = {
    ...base,
    role: 'external',
    identity_status: 'verified_contact',
    access_tier: 'tier_1',
    call_answering_status: 'allowed',
    permission_snapshot: { ...base.permission_snapshot, can_hold_current_session: true },
    canonical: { caller_profile: 'ready', permissions: 'ready', rag: 'pending_neon', config: 'ready', marker: PENDING_NEON_INTEGRATION },
  }
  const held = applyCurrentSessionHold(allowed, 'abuse', 'repeated abuse', '2026-09-22T00:01:00Z')
  assert.ok(held)
  assert.equal(held?.hold.active, true)
  assert.equal(held?.hold.reason_code, 'abuse')
})

test('re-entry acknowledgement requires both pending state and explicit permission', () => {
  const base = createPendingNeonSession({ conversation_id: 'c3', interaction_mode: 'inbound_external' })
  assert.equal(applyReentryAcknowledgement(base), null)
  const allowed: CarolineSessionState = {
    ...base,
    role: 'external',
    call_answering_status: 'allowed',
    reentry_notice_pending: true,
    permission_snapshot: { ...base.permission_snapshot, can_ack_reentry: true },
  }
  assert.equal(applyReentryAcknowledgement(allowed)?.reentry_notice_pending, false)
})
