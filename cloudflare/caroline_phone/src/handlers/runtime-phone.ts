import type { Env } from '../types.ts'
import { callCoreRuntime, type CoreOperation } from '../lib/core-runtime.ts'
import { json } from '../lib/http.ts'
import { log } from '../lib/log.ts'
import { RequestBodyTooLargeError, readBodyWithLimit } from '../lib/request.ts'
import { verifyRuntimeKey } from '../lib/security.ts'

const ACTION_REQUEST_MAX_BYTES = 32 * 1024
const ACTION_RESPONSE_MAX_BYTES = 64 * 1024

export type PhoneAction = 'contact-resolve' | 'sms' | 'calendar-read' | 'hold' | 'reentry-ack'

type ParsedAction = {
  operation: CoreOperation
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
  const value = text(body.conversation_id, 256, true)
  return value ?? null
}

function parseContactResolve(body: Record<string, unknown>): ParsedAction | null {
  const cid = conversationId(body)
  if (!cid) return null
  const name = text(body.name, 200)
  const phone = text(body.phone, 128)
  if (!name && !phone) return null
  return {
    operation: 'phone_contact_resolve',
    input: { conversation_id: cid, ...(name ? { name } : {}), ...(phone ? { phone } : {}) },
  }
}

function parseSms(body: Record<string, unknown>): ParsedAction | null {
  const cid = conversationId(body)
  const toNumber = text(body.to_number, 128, true)
  const message = text(body.message_summary, 4000, true)
  if (!cid || !toNumber || !message) return null
  const executeAt = text(body.execute_at, 80)
  const timezone = text(body.timezone, 100)
  const targetContactRef = text(body.target_contact_ref, 256)
  const linkedCallRef = text(body.linked_call_ref, 256)
  const originalInstruction = text(body.original_instruction, 4000)
  return {
    operation: 'phone_sms',
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

function parseCalendarRead(body: Record<string, unknown>): ParsedAction | null {
  const cid = conversationId(body)
  if (!cid) return null
  const startAt = text(body.start_at, 80)
  const endAt = text(body.end_at, 80)
  const requestedPhone = text(body.subject_phone, 128)
  const rawLimit = body.limit
  const limit = rawLimit === undefined ? undefined : Number(rawLimit)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 25)) return null
  return {
    operation: 'phone_calendar_read',
    input: {
      conversation_id: cid,
      ...(startAt ? { start_at: startAt } : {}),
      ...(endAt ? { end_at: endAt } : {}),
      ...(requestedPhone ? { subject_phone: requestedPhone } : {}),
      ...(limit !== undefined ? { limit } : {}),
    },
  }
}

function parseHold(body: Record<string, unknown>): ParsedAction | null {
  const cid = conversationId(body)
  if (!cid) return null
  const reasonCode = text(body.reason_code, 80)
  const reasonSummary = text(body.reason_summary, 1000)
  return {
    operation: 'phone_hold',
    input: {
      conversation_id: cid,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
      ...(reasonSummary ? { reason_summary: reasonSummary } : {}),
    },
  }
}

function parseReentryAck(body: Record<string, unknown>): ParsedAction | null {
  const cid = conversationId(body)
  if (!cid) return null
  return { operation: 'phone_reentry_ack', input: { conversation_id: cid } }
}

function parseAction(action: PhoneAction, value: unknown): ParsedAction | null {
  if (!isObject(value)) return null
  switch (action) {
    case 'contact-resolve': return parseContactResolve(value)
    case 'sms': return parseSms(value)
    case 'calendar-read': return parseCalendarRead(value)
    case 'hold': return parseHold(value)
    case 'reentry-ack': return parseReentryAck(value)
  }
}

function safeContact(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null
  const displayName = text(value.display_name, 200)
  const phone = text(value.phone, 128)
  const contactRef = text(value.contact_ref, 256)
  if (!displayName || !phone) return null
  return { display_name: displayName, phone, ...(contactRef ? { contact_ref: contactRef } : {}) }
}

function sanitizeContactResolve(body: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof body.authorized !== 'boolean') return null
  if (!body.authorized) return { authorized: false, unique: false, candidates: [] }
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.slice(0, 5).flatMap((row) => {
        const safe = safeContact(row)
        return safe ? [safe] : []
      })
    : []
  const unique = body.unique === true && candidates.length === 1
  return { authorized: true, unique, candidates }
}

function sanitizeSms(body: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof body.authorized !== 'boolean') return null
  if (!body.authorized) return { authorized: false, accepted: false, disposition: 'rejected' }
  const accepted = body.accepted === true
  const allowed = new Set(['sent', 'scheduled', 'queued', 'rejected'])
  const rawDisposition = typeof body.disposition === 'string' && allowed.has(body.disposition) ? body.disposition : 'rejected'
  const disposition = accepted ? rawDisposition : 'rejected'
  const executeAt = text(body.execute_at, 80)
  return { authorized: true, accepted, disposition, ...(executeAt ? { execute_at: executeAt } : {}) }
}

function sanitizeCalendar(body: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof body.authorized !== 'boolean') return null
  if (!body.authorized) return { authorized: false, share_level: 'none', events: [] }
  const levels = new Set(['none', 'busy_only', 'title', 'details'])
  const shareLevel = typeof body.share_level === 'string' && levels.has(body.share_level) ? body.share_level : 'none'
  if (shareLevel === 'none') return { authorized: true, share_level: 'none', events: [] }
  const events = Array.isArray(body.events) ? body.events.slice(0, 25).flatMap((row) => {
    if (!isObject(row)) return []
    const startAt = text(row.start_at, 80)
    const endAt = text(row.end_at, 80)
    if (!startAt || !endAt) return []
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
    return [event]
  }) : []
  return { authorized: true, share_level: shareLevel, events }
}

function sanitizeHold(body: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof body.authorized !== 'boolean') return null
  if (!body.authorized) return { authorized: false, held: false, state: 'rejected' }
  const held = body.held === true
  return { authorized: true, held, state: held ? 'active' : 'rejected' }
}

function sanitizeReentry(body: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof body.authorized !== 'boolean') return null
  if (!body.authorized) return { authorized: false, acknowledged: false, message: '' }
  const acknowledged = body.acknowledged === true
  const message = acknowledged ? (text(body.message, 600) ?? '') : ''
  return { authorized: true, acknowledged, message }
}

function sanitizeAction(action: PhoneAction, value: unknown): Record<string, unknown> | null {
  if (!isObject(value) || value.schema_version !== '1') return null
  switch (action) {
    case 'contact-resolve': return sanitizeContactResolve(value)
    case 'sms': return sanitizeSms(value)
    case 'calendar-read': return sanitizeCalendar(value)
    case 'hold': return sanitizeHold(value)
    case 'reentry-ack': return sanitizeReentry(value)
  }
}

export async function handleRuntimePhoneAction(req: Request, env: Env, requestId: string, action: PhoneAction): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, requestId)
  if (!verifyRuntimeKey(req, env.CAROLINE_RUNTIME_KEY)) return json({ error: 'unauthorized' }, 401, requestId)
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

  const core = await callCoreRuntime(env, actionInput.operation, actionInput.input, requestId, ACTION_RESPONSE_MAX_BYTES)
  if (!core.ok) {
    log('warn', 'runtime_phone_core_failed', {
      request_id: requestId,
      action,
      reason: core.reason,
      upstream_status: core.status ?? null,
    })
    return json({ error: core.reason }, core.reason === 'core_rejected' || core.reason === 'core_unreachable' ? 502 : 503, requestId)
  }

  const response = sanitizeAction(action, core.body)
  if (!response) {
    log('error', 'runtime_phone_core_response_invalid', { request_id: requestId, action })
    return json({ error: 'invalid_core_phone_action_response' }, 502, requestId)
  }
  return json(response, 200, requestId)
}
