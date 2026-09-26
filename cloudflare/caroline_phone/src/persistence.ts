import type { CallSessionState } from './call-session'
import { queryOne, queryRows, requireTenantId, type DatabaseEnv } from './database'

export type R2BucketLike = {
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: unknown): Promise<unknown>
}

export type PersistenceEnv = DatabaseEnv & {
  CAROLINE_TRANSCRIPTS?: R2BucketLike
}

export type PostCallQueueMessage = {
  event_id: string
  type: string
  conversation_id: string
  call_context_id?: string
  event_timestamp?: number | string
}

type Json = Record<string, unknown>

type TranscriptTurn = {
  role?: unknown
  message?: unknown
  text?: unknown
  time_in_call_secs?: unknown
  tool_calls?: unknown
  tool_results?: unknown
}

function safeJsonObject(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
}

function externalPartyPhone(session: CallSessionState): string | undefined {
  return session.direction === 'outbound' ? session.to_number : session.from_number
}

function roleFor(value: unknown): 'agent' | 'user' | 'system' | 'tool' {
  if (value === 'agent' || value === 'user' || value === 'system' || value === 'tool') return value
  return 'system'
}

function turnContent(turn: TranscriptTurn): string {
  if (typeof turn.message === 'string') return turn.message
  if (typeof turn.text === 'string') return turn.text
  return ''
}

function conversationTranscript(conversation: Json): TranscriptTurn[] {
  return Array.isArray(conversation.transcript) ? conversation.transcript as TranscriptTurn[] : []
}

function transcriptText(turns: TranscriptTurn[]): string {
  return turns
    .map((turn) => {
      const content = turnContent(turn).trim()
      if (!content) return ''
      return `${roleFor(turn.role)}: ${content}`
    })
    .filter(Boolean)
    .join('\n')
}

function conversationSummary(conversation: Json): string | undefined {
  const analysis = safeJsonObject(conversation.analysis)
  for (const candidate of [analysis.transcript_summary, analysis.summary, conversation.summary]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 20000)
  }
  return undefined
}

function durationSeconds(conversation: Json): number | null {
  const metadata = safeJsonObject(conversation.metadata)
  const candidates = [metadata.call_duration_secs, metadata.duration_seconds, conversation.call_duration_secs]
  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value) && value >= 0) return Math.floor(value)
  }
  return null
}

export async function persistCallContext(env: PersistenceEnv, session: CallSessionState): Promise<void> {
  if (!session.direction || !session.selected_agent_id || !session.expires_at) throw new Error('call_context_incomplete')
  const tenantId = await requireTenantId(env)
  const externalPhone = externalPartyPhone(session) ?? null

  await queryRows(
    env,
    `insert into call_contexts
       (tenant_id, call_context_id, twilio_call_sid, direction, selected_agent_id, external_phone, expires_at)
     values ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz)
     on conflict (call_context_id) do update
       set twilio_call_sid = excluded.twilio_call_sid,
           direction = excluded.direction,
           selected_agent_id = excluded.selected_agent_id,
           external_phone = excluded.external_phone,
           expires_at = excluded.expires_at,
           updated_at = now()`,
    [
      tenantId,
      session.call_context_id,
      session.call_sid,
      session.direction,
      session.selected_agent_id,
      externalPhone,
      session.expires_at,
    ],
  )

  await queryRows(
    env,
    `insert into calls
       (tenant_id, call_context_id, twilio_call_sid, direction, agent_id, status, answered_by, started_at)
     values ($1::uuid, $2, $3, $4, $5, $6, $7, now())
     on conflict (tenant_id, twilio_call_sid) do update
       set call_context_id = excluded.call_context_id,
           direction = excluded.direction,
           agent_id = excluded.agent_id,
           status = coalesce(excluded.status, calls.status),
           answered_by = coalesce(excluded.answered_by, calls.answered_by),
           updated_at = now()`,
    [
      tenantId,
      session.call_context_id,
      session.call_sid,
      session.direction,
      session.selected_agent_id,
      session.call_status ?? session.register_status ?? 'initiated',
      session.answered_by ?? null,
    ],
  )
}

export async function persistCallLifecycleEvent(
  env: PersistenceEnv,
  session: CallSessionState,
  eventType: string,
  providerEventId: string | null,
  payloadSafe: Json,
): Promise<void> {
  const tenantId = await requireTenantId(env)
  const call = await queryOne<{ id: string }>(
    env,
    `select id::text as id
       from calls
      where tenant_id = $1::uuid
        and twilio_call_sid = $2
      limit 1`,
    [tenantId, session.call_sid],
  )

  await queryRows(
    env,
    `insert into call_events
       (tenant_id, call_id, call_context_id, event_type, provider, provider_event_id, payload_safe)
     values ($1::uuid, $2::uuid, $3, $4, 'twilio', $5, $6::jsonb)
     on conflict (tenant_id, provider, provider_event_id) do nothing`,
    [tenantId, call?.id ?? null, session.call_context_id, eventType, providerEventId, JSON.stringify(payloadSafe)],
  )

  if (eventType === 'status' && typeof payloadSafe.call_status === 'string') {
    await queryRows(
      env,
      `update calls
          set status = $3,
              ended_at = case when $3 in ('completed', 'failed', 'busy', 'no-answer', 'canceled') then coalesce(ended_at, now()) else ended_at end,
              updated_at = now()
        where tenant_id = $1::uuid
          and twilio_call_sid = $2`,
      [tenantId, session.call_sid, payloadSafe.call_status],
    )
  }

  if (eventType === 'amd' && typeof payloadSafe.answered_by === 'string') {
    await queryRows(
      env,
      `update calls set answered_by = $3, updated_at = now()
        where tenant_id = $1::uuid and twilio_call_sid = $2`,
      [tenantId, session.call_sid, payloadSafe.answered_by],
    )
  }
}

export async function outboundAllowed(env: PersistenceEnv, e164Phone: string): Promise<boolean> {
  const tenantId = await requireTenantId(env)
  const dnc = await queryOne<{ blocked: boolean }>(
    env,
    `select true as blocked
       from dnc_records
      where tenant_id = $1::uuid
        and normalized_phone = $2
        and active = true
      limit 1`,
    [tenantId, e164Phone],
  )
  if (dnc?.blocked) return false

  const restrictedContact = await queryOne<{ blocked: boolean }>(
    env,
    `select true as blocked
       from caller_identity_links cil
       join customers c
         on c.id = cil.customer_id
        and c.tenant_id = cil.tenant_id
       left join contact_preferences cp
         on cp.tenant_id = c.tenant_id
        and cp.customer_id = c.id
      where cil.tenant_id = $1::uuid
        and cil.identifier_type = 'phone'
        and cil.normalized_value = $2
        and cil.revoked_at is null
        and (c.status = 'blocked' or cp.voice_allowed = false)
      limit 1`,
    [tenantId, e164Phone],
  )

  return !restrictedContact?.blocked
}

export async function persistPostCall(
  env: PersistenceEnv,
  message: PostCallQueueMessage,
  conversation: Json,
  session: CallSessionState | null,
): Promise<void> {
  const tenantId = await requireTenantId(env)

  await queryRows(
    env,
    `insert into post_call_event_receipts
       (tenant_id, event_id, event_type, conversation_id, call_context_id, status, attempts)
     values ($1::uuid, $2, $3, $4, $5, 'processing', 1)
     on conflict (tenant_id, event_id) do update
       set attempts = post_call_event_receipts.attempts + 1,
           status = case when post_call_event_receipts.status = 'completed' then 'completed' else 'processing' end,
           updated_at = now()`,
    [tenantId, message.event_id, message.type, message.conversation_id, message.call_context_id ?? null],
  )

  const contextId = message.call_context_id ?? session?.call_context_id
  if (!contextId) throw new Error('call_context_id_missing')

  if (session) await persistCallContext(env, session)

  const call = await queryOne<{ id: string }>(
    env,
    `update calls
        set elevenlabs_conversation_id = $3,
            status = coalesce(nullif($4, ''), status),
            duration_seconds = coalesce($5, duration_seconds),
            ended_at = coalesce(ended_at, now()),
            metadata = metadata || $6::jsonb,
            updated_at = now()
      where tenant_id = $1::uuid
        and call_context_id = $2
      returning id::text`,
    [
      tenantId,
      contextId,
      message.conversation_id,
      typeof conversation.status === 'string' ? conversation.status : '',
      durationSeconds(conversation),
      JSON.stringify({ elevenlabs_agent_id: conversation.agent_id ?? null }),
    ],
  )
  if (!call) throw new Error('call_record_missing')

  const turns = conversationTranscript(conversation)
  const plainText = transcriptText(turns)
  await queryRows(
    env,
    `insert into call_transcripts
       (tenant_id, call_id, elevenlabs_conversation_id, transcript_json, transcript_text)
     values ($1::uuid, $2::uuid, $3, $4::jsonb, $5)
     on conflict (tenant_id, elevenlabs_conversation_id) do update
       set transcript_json = excluded.transcript_json,
           transcript_text = excluded.transcript_text,
           updated_at = now()`,
    [tenantId, call.id, message.conversation_id, JSON.stringify(turns), plainText],
  )

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index]
    const content = turnContent(turn).trim()
    if (!content) continue
    const seconds = Number(turn.time_in_call_secs)
    const occurredAt = Number.isFinite(seconds) && seconds >= 0
      ? new Date(Date.now() - Math.max(0, (durationSeconds(conversation) ?? 0) - seconds) * 1000).toISOString()
      : null
    await queryRows(
      env,
      `insert into call_turns
         (tenant_id, call_id, turn_index, speaker, content, occurred_at, metadata)
       values ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz, $7::jsonb)
       on conflict (call_id, turn_index) do update
         set speaker = excluded.speaker,
             content = excluded.content,
             occurred_at = excluded.occurred_at,
             metadata = excluded.metadata`,
      [
        tenantId,
        call.id,
        index,
        roleFor(turn.role),
        content,
        occurredAt,
        JSON.stringify({ has_tool_calls: Boolean(turn.tool_calls), has_tool_results: Boolean(turn.tool_results) }),
      ],
    )
  }

  const summary = conversationSummary(conversation)
  if (summary) {
    await queryRows(
      env,
      `insert into conversation_summaries (tenant_id, call_id, summary, source, source_version)
       values ($1::uuid, $2::uuid, $3, 'elevenlabs', $4)
       on conflict (call_id, source) do update
         set summary = excluded.summary,
             source_version = excluded.source_version,
             updated_at = now()`,
      [tenantId, call.id, summary, typeof conversation.agent_id === 'string' ? conversation.agent_id : null],
    )
  }

  if (env.CAROLINE_TRANSCRIPTS) {
    const objectKey = `calls/${contextId}/${message.conversation_id}.json`
    await env.CAROLINE_TRANSCRIPTS.put(objectKey, JSON.stringify({ message, conversation }), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { call_context_id: contextId, conversation_id: message.conversation_id },
    })
  }

  await queryRows(
    env,
    `update post_call_event_receipts
        set status = 'completed', processed_at = now(), last_error = null, updated_at = now()
      where tenant_id = $1::uuid and event_id = $2`,
    [tenantId, message.event_id],
  )
}

export async function markPostCallFailure(
  env: PersistenceEnv,
  message: PostCallQueueMessage,
  errorCode: string,
): Promise<void> {
  try {
    const tenantId = await requireTenantId(env)
    await queryRows(
      env,
      `insert into post_call_event_receipts
         (tenant_id, event_id, event_type, conversation_id, call_context_id, status, attempts, last_error)
       values ($1::uuid, $2, $3, $4, $5, 'failed', 1, $6)
       on conflict (tenant_id, event_id) do update
         set status = case when post_call_event_receipts.status = 'completed' then 'completed' else 'failed' end,
             attempts = post_call_event_receipts.attempts + 1,
             last_error = case when post_call_event_receipts.status = 'completed' then post_call_event_receipts.last_error else excluded.last_error end,
             updated_at = now()`,
      [tenantId, message.event_id, message.type, message.conversation_id, message.call_context_id ?? null, errorCode.slice(0, 500)],
    )
  } catch {
    // Preserve queue retry semantics even when the database is unavailable.
  }
}
