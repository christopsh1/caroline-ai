declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders })

const encoder = new TextEncoder()
const webhookSecret = Deno.env.get('ELEVENLABS_WEBHOOK_SECRET')
const runtimeKey = Deno.env.get('CAROLINE_RUNTIME_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const contextPostCallUrl = `${supabaseUrl}/functions/v1/caroline-context/post-call`
const contextEventUrl = `${supabaseUrl}/functions/v1/caroline-context/event`
const notifyUrl = `${supabaseUrl}/functions/v1/caroline-notify`
const reconcileUrl = `${supabaseUrl}/functions/v1/caroline-memory-reconcile`
const MAX_SIGNATURE_AGE_SECONDS = 30 * 60
const CAROLINE_AGENT_ID = 'agent_8001m2ba4rmder6t7wq270ntj43j'

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ service: 'caroline-post-call', event, ...fields }))
}
function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
function safeInteger(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}
function isoFromUnix(value: unknown): string | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString()
}
function endIso(startUnix: unknown, durationSecs: unknown): string | null {
  const start = Number(startUnix)
  const duration = Number(durationSecs)
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(duration) || duration < 0) return null
  return new Date((start + duration) * 1000).toISOString()
}
function collectedValue(data: any, key: string): unknown {
  const item = data?.analysis?.data_collection_results?.[key]
  return item && Object.prototype.hasOwnProperty.call(item, 'value') ? item.value : null
}
function sanitizedTranscript(data: any) {
  if (!Array.isArray(data?.transcript)) return []
  return data.transcript.slice(0, 500).map((turn: any) => ({
    role: safeString(turn?.role) ?? 'unknown',
    message: safeString(turn?.message) ?? '',
    time_in_call_secs: safeInteger(turn?.time_in_call_secs),
  }))
}
function parseSignature(header: string | null): { timestamp: string; signatures: string[] } | null {
  if (!header) return null
  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [rawKey, ...rest] = part.trim().split('=')
    const value = rest.join('=')
    if (rawKey === 't') timestamp = value
    if (rawKey === 'v0' && value) signatures.push(value.toLowerCase())
  }
  return timestamp && signatures.length ? { timestamp, signatures } : null
}
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
async function verifyElevenLabsSignature(rawBody: string, header: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!webhookSecret) return { ok: false, reason: 'webhook_secret_not_configured' }
  const parsed = parseSignature(header)
  if (!parsed) return { ok: false, reason: 'signature_missing_or_malformed' }
  const timestamp = Number(parsed.timestamp)
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid_signature_timestamp' }
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp)
  if (age > MAX_SIGNATURE_AGE_SECONDS) return { ok: false, reason: 'stale_signature' }
  const expected = await hmacHex(webhookSecret, `${parsed.timestamp}.${rawBody}`)
  const match = parsed.signatures.some((sig) => timingSafeEqualHex(expected, sig))
  return match ? { ok: true } : { ok: false, reason: 'invalid_signature' }
}
function buildNormalizedPayload(event: any) {
  const data = event?.data ?? {}
  const metadata = data?.metadata ?? {}
  const phoneCall = metadata?.phone_call ?? {}
  const dynamicVariables = data?.conversation_initiation_client_data?.dynamic_variables ?? {}
  const externalNumber = safeString(phoneCall?.external_number)
  const systemCaller = safeString(dynamicVariables?.system__caller_id)
  const normalizedPhone = externalNumber ?? systemCaller
  const conversationId = safeString(data?.conversation_id)
  const providerCallId = safeString(phoneCall?.call_sid) ?? safeString(phoneCall?.call_id)
  const provider = safeString(metadata?.conversation_initiation_source)
  const direction = safeString(phoneCall?.direction)
  const phoneNumberId = safeString(phoneCall?.phone_number_id)
  const duration = safeInteger(metadata?.call_duration_secs)
  const terminationReason = safeString(metadata?.termination_reason)
  const callSuccessful = safeString(data?.analysis?.call_successful)
  return {
    event_type: 'post_call_transcription',
    normalized_phone: normalizedPhone,
    conversation_id: conversationId,
    event_id: conversationId ? `elevenlabs:post_call_transcription:${conversationId}` : null,
    caller_name: collectedValue(data, 'caller_name'),
    caller_organization: collectedValue(data, 'caller_organization'),
    caller_relationship: collectedValue(data, 'caller_relationship'),
    request_summary: collectedValue(data, 'request_summary') ?? data?.analysis?.transcript_summary ?? null,
    request_urgency: collectedValue(data, 'request_urgency'),
    call_outcome: collectedValue(data, 'call_outcome'),
    callback_number: collectedValue(data, 'callback_number'),
    detected_tone_profile: collectedValue(data, 'detected_tone_profile'),
    relationship_context_and_notes: collectedValue(data, 'relationship_context_and_notes'),
    started_at: isoFromUnix(metadata?.start_time_unix_secs),
    ended_at: endIso(metadata?.start_time_unix_secs, metadata?.call_duration_secs),
    telephony_provider: provider,
    direction,
    provider_call_id: providerCallId,
    agent_phone_number_id: phoneNumberId,
    call_duration_secs: duration,
    termination_reason: terminationReason,
    call_successful: callSuccessful,
    transcript: sanitizedTranscript(data),
    metadata: {
      source: 'elevenlabs_post_call_transcription',
      event_timestamp: event?.event_timestamp ?? null,
      agent_id: data?.agent_id ?? null,
      branch_id: data?.branch_id ?? null,
      version_id: data?.version_id ?? null,
      environment: data?.environment ?? null,
      conversation_initiation_source: provider,
      direction,
      phone_number_id: phoneNumberId,
      agent_number: safeString(phoneCall?.agent_number),
      external_number: externalNumber,
      call_id: safeString(phoneCall?.call_id),
      call_sid: safeString(phoneCall?.call_sid),
      termination_reason: terminationReason,
      call_duration_secs: duration,
      call_successful: callSuccessful,
      transcript_summary: data?.analysis?.transcript_summary ?? null,
      dynamic_context_identity_status: dynamicVariables?.caller_identity_status ?? null,
      dynamic_context_access_tier: dynamicVariables?.caller_access_tier ?? null,
    },
  }
}
function buildFailureEvent(event: any, conversationId: string | null) {
  const data = event?.data ?? {}
  const metadata = data?.metadata ?? {}
  const body = metadata?.body ?? {}
  const providerCallId = safeString(body?.CallSid) ?? safeString(body?.CallSID) ?? safeString(metadata?.call_sid)
  const eventKey = conversationId ?? providerCallId ?? String(event?.event_timestamp ?? 'unknown')
  return {
    event_id: `elevenlabs:call_initiation_failure:${eventKey}`,
    event_type: 'call_initiation_failure',
    conversation_id: conversationId,
    telegram_notification_status: 'pending',
    details: {
      failure_reason: safeString(data?.failure_reason),
      telephony_type: safeString(metadata?.type),
      direction: safeString(body?.Direction),
      provider_call_id: providerCallId,
      sip_response_code: safeString(body?.SipResponseCode),
      event_timestamp: event?.event_timestamp ?? null,
    },
  }
}

async function persistFailureEvent(payload: any) {
  if (!runtimeKey) return { ok: false, reason: 'runtime_key_not_configured' }
  const response = await fetch(contextEventUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-caroline-key': runtimeKey },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  return response.ok ? { ok: true, body } : { ok: false, reason: body?.error ?? `event_persist_http_${response.status}` }
}
async function notifyOwner(target: { conversation_id?: string; event_id?: string }) {
  if (!runtimeKey) return { sent: false, reason: 'runtime_key_not_configured' }
  try {
    const response = await fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-caroline-key': runtimeKey },
      body: JSON.stringify(target),
    })
    const text = await response.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    if (!response.ok) return { sent: false, reason: body?.error ?? `notify_http_${response.status}` }
    return { sent: body?.sent === true, duplicate: body?.duplicate === true, message_id: body?.message_id ?? null }
  } catch {
    return { sent: false, reason: 'notify_request_failed' }
  }
}
function queueOwnerNotification(target: { conversation_id?: string; event_id?: string }, logFields: Record<string, unknown>) {
  EdgeRuntime.waitUntil(
    notifyOwner(target)
      .then((notification) => {
        if (notification.sent) log('owner_notified', { ...logFields, duplicate_notification: notification.duplicate === true })
        else log('owner_notification_pending', { ...logFields, reason: notification.reason ?? 'unknown' })
      })
      .catch(() => log('owner_notification_pending', { ...logFields, reason: 'background_notification_failed' }))
  )
}

async function reconcileConversation(conversationId: string) {
  if (!runtimeKey) return { ok: false, reason: 'runtime_key_not_configured' }
  try {
    const response = await fetch(reconcileUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-caroline-key': runtimeKey },
      body: JSON.stringify({ conversation_id: conversationId }),
    })
    const text = await response.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    if (!response.ok) return { ok: false, reason: body?.error ?? `reconcile_http_${response.status}` }
    return { ok: body?.ok === true, candidate_memory_id: body?.candidate_memory?.id ?? null, scheduled_action_id: body?.scheduled_action?.id ?? null }
  } catch {
    return { ok: false, reason: 'reconcile_request_failed' }
  }
}
function queueConversationReconciliation(conversationId: string) {
  EdgeRuntime.waitUntil(
    reconcileConversation(conversationId)
      .then((result) => {
        if (result.ok) log('conversation_reconciled', { conversation_id: conversationId, candidate_memory_id: result.candidate_memory_id ?? null, scheduled_action_id: result.scheduled_action_id ?? null })
        else log('conversation_reconciliation_pending', { conversation_id: conversationId, reason: result.reason ?? 'unknown' })
      })
      .catch(() => log('conversation_reconciliation_pending', { conversation_id: conversationId, reason: 'background_reconciliation_failed' }))
  )
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const rawBody = await req.text()
  const verification = await verifyElevenLabsSignature(rawBody, req.headers.get('ElevenLabs-Signature'))
  if (!verification.ok) {
    log('request_rejected', { reason: verification.reason })
    const status = verification.reason === 'webhook_secret_not_configured' ? 503 : 401
    return json({ error: verification.reason }, status)
  }

  let event: any
  try { event = JSON.parse(rawBody) }
  catch {
    log('request_rejected', { reason: 'invalid_json' })
    return json({ error: 'invalid_json' }, 400)
  }

  const eventType = safeString(event?.type)
  const conversationId = safeString(event?.data?.conversation_id)
  const eventAgentId = safeString(event?.data?.agent_id)
  log('verified_event_received', { event_type: eventType, conversation_id: conversationId, agent_match: eventAgentId === CAROLINE_AGENT_ID })

  if (eventType === 'call_initiation_failure') {
    if (eventAgentId && eventAgentId !== CAROLINE_AGENT_ID) {
      return json({ ok: true, accepted: false, ignored: true, reason: 'different_agent' })
    }
    const failureEvent = buildFailureEvent(event, conversationId)
    const persisted = await persistFailureEvent(failureEvent)
    if (!persisted.ok) {
      log('failure_event_persistence_failed', { conversation_id: conversationId, reason: persisted.reason })
      return json({ error: 'persistence_failed' }, 502)
    }
    queueOwnerNotification(
      { event_id: failureEvent.event_id },
      { conversation_id: conversationId, event_id: failureEvent.event_id, event_type: eventType }
    )
    log('call_initiation_failure_recorded', {
      conversation_id: conversationId,
      event_id: failureEvent.event_id,
      duplicate: persisted.body?.duplicate === true,
    })
    return json({
      ok: true,
      accepted: true,
      persisted: true,
      duplicate: persisted.body?.duplicate === true,
      event_type: eventType,
      notification_queued: true,
    })
  }

  if (eventType !== 'post_call_transcription') {
    return json({ ok: true, accepted: false, ignored: true, event_type: eventType })
  }
  if (eventAgentId !== CAROLINE_AGENT_ID) {
    log('event_ignored', { reason: 'different_agent', conversation_id: conversationId })
    return json({ ok: true, accepted: false, ignored: true, reason: 'different_agent' })
  }
  if (!conversationId) {
    log('request_rejected', { reason: 'conversation_id_required' })
    return json({ error: 'conversation_id_required' }, 400)
  }
  if (!runtimeKey) {
    log('persistence_failed', { reason: 'runtime_key_not_configured', conversation_id: conversationId })
    return json({ error: 'runtime_key_not_configured' }, 503)
  }

  const normalized = buildNormalizedPayload(event)
  if (!normalized.normalized_phone) {
    log('event_ignored', { reason: 'non_telephony_or_missing_external_number', conversation_id: conversationId })
    return json({ ok: true, accepted: true, persisted: false, ignored: true, reason: 'non_telephony_or_missing_external_number' })
  }

  const response = await fetch(contextPostCallUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-caroline-key': runtimeKey },
    body: JSON.stringify(normalized),
  })
  const responseText = await response.text()
  let downstream: any = null
  try { downstream = responseText ? JSON.parse(responseText) : null } catch { downstream = null }

  if (!response.ok) {
    log('persistence_failed', { conversation_id: conversationId, downstream_status: response.status })
    return json({ error: 'persistence_failed', downstream_status: response.status }, 502)
  }

  const duplicate = downstream?.duplicate === true
  log('event_persisted', { conversation_id: conversationId, duplicate, call_history_id: downstream?.call_history_id ?? null })
  queueConversationReconciliation(conversationId)
  queueOwnerNotification({ conversation_id: conversationId }, { conversation_id: conversationId, event_type: eventType })

  return json({
    ok: true,
    accepted: true,
    persisted: true,
    duplicate,
    notification_queued: true,
  })
})

