import type { Env } from '../types.ts'
import {
  getCanonicalCalendar,
  resolveCanonicalContact,
  sendCanonicalSms,
} from '../lib/canonical.ts'
import { json } from '../lib/http.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { verifyRuntimeKey } from '../lib/security.ts'
import { canRunPhoneAction } from '../lib/session-model.ts'
import { acknowledgeSessionReentry, activateSessionHold, loadSession } from '../lib/session-store.ts'

const ACTION_REQUEST_MAX_BYTES = 32 * 1024

export type PhoneAction = 'contact-resolve' | 'sms' | 'calendar-read' | 'hold' | 'reentry-ack'

type ParsedAction = {
  conversation_id: string
  input: Record<string, unknown>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max: number, required = false): string | undefined {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if ((required && !trimmed) || trimmed.length > max) return undefined
  return trimmed
}

function conversationId(body: Record<string, unknown>): string | null {
  return text(body.conversation_id, 256, true) ?? null
}

function parseAction(action: PhoneAction, value: unknown): ParsedAction | null {
  if (!isObject(value)) return null
  const cid = conversationId(value)
  if (!cid) return null

  if (action === 'contact-resolve') {
    const name = text(value.name, 200)
    const phone = text(value.phone, 128)
    if (!name && !phone) return null
    return { conversation_id: cid, input: { conversation_id: cid, ...(name ? { name } : {}), ...(phone ? { phone } : {}) } }
  }

  if (action === 'sms') {
    const toNumber = text(value.to_number, 128, true)
    const message = text(value.message_summary, 4000, true)
    if (!toNumber || !message) return null
    const executeAt = text(value.execute_at, 80)
    const timezone = text(value.timezone, 100)
    const targetContactRef = text(value.target_contact_ref, 256)
    const linkedCallRef = text(value.linked_call_ref, 256)
    const originalInstruction = text(value.original_instruction, 4000)
    return {
      conversation_id: cid,
      input: {
        conversation_id: cid,
        to_number: toNumber,
        message_summary: message,
        ...(executeAt ? { execute_at: executeAt } : {}),
        ...(timezone ? { timezone } : {}),
        ...(targetContactRef ? { target_contact_ref: targetContactRef } : {}),
        ...(linkedCallRef ? { linked_call_ref: linkedCallRef } : {}),
        ...(originalInstruction ? { original_instruction: originalInstruction } : {}),
      },
    }
  }

  if (action === 'calendar-read') {
    const startAt = text(value.start_at, 80)
    const endAt = text(value.end_at, 80)
    const rawLimit = value.limit
    const limit = rawLimit === undefined ? undefined : Number(rawLimit)
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 25)) return null
    return {
      conversation_id: cid,
      input: {
        conversation_id: cid,
        ...(startAt ? { start_at: startAt } : {}),
        ...(endAt ? { end_at: endAt } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
    }
  }

  if (action === 'hold') {
    const reasonCode = text(value.reason_code, 80)
    const reasonSummary = text(value.reason_summary, 1000)
    return {
      conversation_id: cid,
      input: {
        ...(reasonCode ? { reason_code: reasonCode } : {}),
        ...(reasonSummary ? { reason_summary: reasonSummary } : {}),
      },
    }
  }

  return { conversation_id: cid, input: {} }
}

function sanitizeCalendarEvent(row: Record<string, unknown>, shareLevel: string): Record<string, unknown> | null {
  const startAt = text(row.start_at, 80)
  const endAt = text(row.end_at, 80)
  if (!startAt || !endAt) return null
  const event: Record<string, unknown> = { start_at: startAt, end_at: endAt }
  const status = text(row.status, 40)
  if (status) event.status = status
  if (shareLevel === 'title' || shareLevel === 'details') {
    const title = text(row.title, 300)
    if (title) event.title = title
  }
  if (shareLevel === 'details') {
    const description = text(row.description, 3000)
    const location = text(row.location, 500)
    if (description) event.description = description
    if (location) event.location = location
  }
  return event
}

export async function handleRuntimePhoneAction(req: Request, env: Env, requestId: string, action: PhoneAction): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestId)
  if (!verifyRuntimeKey(req, env.CAROLINE_KEY)) return json({ error: 'forbidden' }, 403, requestId)
  if (!(req.headers.get('content-type')?.toLowerCase() ?? '').includes('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415, requestId)
  }

  let rawBody: string
  try { ({ rawBody } = await readBodyWithLimit(req, ACTION_REQUEST_MAX_BYTES)) } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: 'payload_too_large' }, 413, requestId)
    throw error
  }

  let parsed: unknown
  try { parsed = JSON.parse(rawBody) } catch { return json({ error: 'invalid_json' }, 400, requestId) }
  const actionInput = parseAction(action, parsed)
  if (!actionInput) return json({ error: 'invalid_phone_action_request' }, 400, requestId)

  const session = await loadSession(env, actionInput.conversation_id)
  if (session === 'not_configured') return json({ error: 'session_store_unavailable' }, 503, requestId)
  if (!session) return json({ error: 'session_not_initialized' }, 409, requestId)
  if (!canRunPhoneAction(session, action)) return json({ error: 'forbidden' }, 403, requestId)

  if (action === 'hold') {
    const updated = await activateSessionHold(env, actionInput.conversation_id, actionInput.input)
    if (updated === 'not_configured') return json({ error: 'session_store_unavailable' }, 503, requestId)
    if (!updated) return json({ error: 'forbidden' }, 403, requestId)
    return json({
      authorized: true,
      held: true,
      state: 'session_hold_active',
      scope: 'current_session',
      durable_storage: true,
      canonical_persistence: 'pending_neon',
    }, 200, requestId)
  }

  if (action === 'reentry-ack') {
    // Consuming a cross-call re-entry marker is canonical state. Do not mutate
    // only the session copy until Neon can persist the canonical transition.
    return json({ error: 'canonical_backend_pending' }, 503, requestId)
  }

  if (action === 'contact-resolve') {
    const result = await resolveCanonicalContact(env, actionInput.input)
    if (result.status !== 'ready') return json({ error: 'canonical_backend_pending' }, 503, requestId)
    return json({ authorized: true, unique: result.value.unique, candidates: result.value.candidates.slice(0, 5) }, 200, requestId)
  }

  if (action === 'sms') {
    const result = await sendCanonicalSms(env, actionInput.input)
    if (result.status !== 'ready') return json({ error: 'canonical_backend_pending' }, 503, requestId)
    return json({ authorized: true, ...result.value }, 200, requestId)
  }

  const result = await getCanonicalCalendar(env, actionInput.input)
  if (result.status !== 'ready') return json({ error: 'canonical_backend_pending' }, 503, requestId)
  const shareLevel = session.permission_snapshot.calendar_share_level
  const events = result.value.events.slice(0, 25).flatMap((row) => {
    if (!isObject(row)) return []
    const safe = sanitizeCalendarEvent(row, shareLevel)
    return safe ? [safe] : []
  })
  return json({ authorized: true, share_level: shareLevel, events }, 200, requestId)
}
