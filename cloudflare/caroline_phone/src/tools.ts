import { getCallSession, type CallSessionBinding, type CallSessionState } from './call-session'
import { queryOne, queryRows, requireTenantId, sha256Hex, vectorLiteral, type DatabaseEnv } from './database'
import { embedSearchQuery, PRODUCTION_EMBEDDING, type EmbeddingEnv } from './embeddings'

export type ToolEnv = DatabaseEnv & EmbeddingEnv & {
  ELEVENLABS_TOOL_SECRET?: string
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  CALL_SESSION: CallSessionBinding
}

type Json = Record<string, unknown>

type ToolContext = {
  tenantId: string
  session: CallSessionState
  externalPhone?: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function authorized(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const bearer = request.headers.get('authorization')
  const direct = request.headers.get('x-caroline-tool-key')
  return bearer === `Bearer ${secret}` || direct === secret
}

function cleanString(value: unknown, max = 1000): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, max) : undefined
}

function cleanObject(value: unknown, maxBytes = 4096): Json | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const encoded = JSON.stringify(value)
  if (encoded.length > maxBytes) return undefined
  return value as Json
}

function externalPartyPhone(session: CallSessionState): string | undefined {
  return session.direction === 'outbound' ? session.to_number : session.from_number
}

function validIso(value: unknown): string | undefined {
  const text = cleanString(value, 80)
  if (!text) return undefined
  const millis = Date.parse(text)
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function parseToolRequest(
  request: Request,
  env: ToolEnv,
): Promise<{ body: Json; context: ToolContext; startedAt: number } | Response> {
  const startedAt = Date.now()
  if (!authorized(request, env.ELEVENLABS_TOOL_SECRET)) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: Json
  try {
    body = (await request.json()) as Json
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const callContextId = cleanString(body.call_context_id, 128) ?? ''
  if (!callContextId || !/^[A-Za-z0-9_-]{20,128}$/.test(callContextId)) {
    return json({ ok: false, error: 'call_context_id_required' }, 400)
  }

  const session = await getCallSession(env.CALL_SESSION, callContextId)
  if (!session) return json({ ok: false, error: 'call_context_not_found' }, 404)
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) {
    return json({ ok: false, error: 'call_context_expired' }, 410)
  }

  let tenantId: string
  try {
    tenantId = await requireTenantId(env)
  } catch {
    return json({ ok: false, error: 'database_not_configured' }, 503)
  }

  return {
    body,
    context: { tenantId, session, externalPhone: externalPartyPhone(session) },
    startedAt,
  }
}

async function auditTool(
  env: ToolEnv,
  context: ToolContext,
  toolName: string,
  resultStatus: string,
  startedAt: number,
  details: Json = {},
): Promise<void> {
  try {
    await queryRows(
      env,
      `insert into tool_audit_events
         (tenant_id, call_context_id, tool_name, authorization_result, result_status, latency_ms, details_safe)
       values ($1::uuid, $2, $3, 'authorized', $4, $5, $6::jsonb)`,
      [
        context.tenantId,
        context.session.call_context_id,
        toolName,
        resultStatus,
        Math.max(0, Date.now() - startedAt),
        JSON.stringify(details),
      ],
    )
  } catch {
    // Tool execution must fail closed on policy/data errors, but audit transport must not leak internals to the model.
  }
}

type CustomerRow = {
  customer_id: string
  display_name: string | null
  notes_safe: string | null
  calendar_share_level: string | null
  relationship_disclosure_allowed: boolean | null
  verified: boolean
}

async function customerLookup(env: ToolEnv, context: ToolContext, startedAt: number): Promise<Response> {
  if (!context.externalPhone) {
    await auditTool(env, context, 'customer_lookup', 'no_phone', startedAt)
    return json({ ok: true, caller: { identity_status: 'unknown', verification_required: true, protected_data_disclosed: false } })
  }

  const row = await queryOne<CustomerRow>(
    env,
    `select c.id::text as customer_id,
            c.display_name,
            c.notes_safe,
            cp.calendar_share_level,
            cp.relationship_disclosure_allowed,
            exists (
              select 1
                from verification_sessions vs
               where vs.tenant_id = $1::uuid
                 and vs.call_context_id = $3
                 and vs.customer_id = c.id
                 and vs.status = 'verified'
                 and vs.expires_at > now()
            ) as verified
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
        and c.status = 'active'
      limit 1`,
    [context.tenantId, context.externalPhone, context.session.call_context_id],
  )

  if (!row) {
    await auditTool(env, context, 'customer_lookup', 'unknown', startedAt)
    return json({ ok: true, caller: { identity_status: 'unknown', verification_required: true, protected_data_disclosed: false } })
  }

  if (!row.verified) {
    await auditTool(env, context, 'customer_lookup', 'verification_required', startedAt, { customer_match: true })
    return json({
      ok: true,
      caller: {
        identity_status: 'candidate',
        verification_required: true,
        protected_data_disclosed: false,
      },
    })
  }

  await queryRows(
    env,
    `update call_contexts
        set customer_id = $3::uuid,
            identity_status = 'verified',
            access_tier = 'known_contact_verified',
            updated_at = now()
      where tenant_id = $1::uuid
        and call_context_id = $2`,
    [context.tenantId, context.session.call_context_id, row.customer_id],
  )

  await auditTool(env, context, 'customer_lookup', 'verified', startedAt, { customer_match: true })
  return json({
    ok: true,
    caller: {
      identity_status: 'verified',
      display_name: row.display_name ?? undefined,
      access_tier: 'known_contact_verified',
      relationship_summary: row.relationship_disclosure_allowed ? row.notes_safe ?? undefined : undefined,
      calendar_share_level: row.calendar_share_level ?? 'none',
      verification_required: false,
      protected_data_disclosed: true,
    },
  })
}

type KnowledgeRow = {
  id: string
  title: string
  content: string
  score: number | string
}

async function searchKnowledge(env: ToolEnv, context: ToolContext, body: Json, startedAt: number): Promise<Response> {
  const query = cleanString(body.query, 500)
  if (!query) return json({ ok: false, error: 'query_required' }, 400)

  const embedding = await embedSearchQuery(env, query)
  const vector = vectorLiteral(embedding, PRODUCTION_EMBEDDING.dimensions)
  const rows = await queryRows<KnowledgeRow>(
    env,
    `select kc.id::text as id,
            kd.title,
            kc.content,
            1 - (kc.embedding <=> $2::vector) as score
       from knowledge_chunks kc
       join knowledge_documents kd
         on kd.id = kc.document_id
        and kd.tenant_id = kc.tenant_id
      where kc.tenant_id = $1::uuid
        and kd.status = 'active'
        and kc.embedding is not null
        and kc.embedding_provider = $3
        and kc.embedding_model = $4
        and kc.embedding_version = $5
        and kc.embedding_dimensions = $6
      order by kc.embedding <=> $2::vector
      limit 5`,
    [
      context.tenantId,
      vector,
      PRODUCTION_EMBEDDING.provider,
      PRODUCTION_EMBEDDING.model,
      PRODUCTION_EMBEDDING.version,
      PRODUCTION_EMBEDDING.dimensions,
    ],
  )

  const queryHash = await sha256Hex(query)
  const ids = rows.map((row) => row.id)
  const scores = rows.map((row) => Number(row.score)).filter(Number.isFinite)
  await queryRows(
    env,
    `insert into rag_retrieval_audit
       (tenant_id, call_context_id, query_sha256, provider, model, embedding_version, dimensions, input_type, top_k, result_chunk_ids, result_scores, latency_ms)
     values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, 5, $9::uuid[], $10::double precision[], $11)`,
    [
      context.tenantId,
      context.session.call_context_id,
      queryHash,
      PRODUCTION_EMBEDDING.provider,
      PRODUCTION_EMBEDDING.model,
      PRODUCTION_EMBEDDING.version,
      PRODUCTION_EMBEDDING.dimensions,
      PRODUCTION_EMBEDDING.queryInputType,
      ids,
      scores,
      Math.max(0, Date.now() - startedAt),
    ],
  )

  await auditTool(env, context, 'search_knowledge', 'success', startedAt, { result_count: rows.length })
  return json({
    ok: true,
    results: rows.map((row) => ({
      title: row.title,
      snippet: row.content.slice(0, 1200),
      source_type: 'knowledge',
      score: Number(row.score),
    })),
  })
}

type AvailabilityRow = { starts_at: string; ends_at: string }

async function getAvailability(env: ToolEnv, context: ToolContext, startedAt: number): Promise<Response> {
  const rows = await queryRows<AvailabilityRow>(
    env,
    `select starts_at::text, ends_at::text
       from availability_slots
      where tenant_id = $1::uuid
        and status = 'available'
        and starts_at >= now()
        and starts_at < now() + interval '30 days'
        and (expires_at is null or expires_at > now())
      order by starts_at
      limit 8`,
    [context.tenantId],
  )
  await auditTool(env, context, 'get_availability', 'success', startedAt, { result_count: rows.length })
  return json({
    ok: true,
    status: rows.length ? 'available' : 'no_published_availability',
    timezone: 'America/New_York',
    windows: rows.map((row) => ({ start: row.starts_at, end: row.ends_at, status: 'available' })),
  })
}

type VerificationRow = { customer_id: string }

async function verifiedCustomerId(env: ToolEnv, context: ToolContext): Promise<string | null> {
  const row = await queryOne<VerificationRow>(
    env,
    `select customer_id::text
       from verification_sessions
      where tenant_id = $1::uuid
        and call_context_id = $2
        and status = 'verified'
        and customer_id is not null
        and expires_at > now()
      order by verified_at desc nulls last, created_at desc
      limit 1`,
    [context.tenantId, context.session.call_context_id],
  )
  return row?.customer_id ?? null
}

async function prepareAction(env: ToolEnv, context: ToolContext, body: Json, startedAt: number): Promise<Response> {
  const actionType = cleanString(body.action_type, 80)
  const action = cleanObject(body.action, 4096)
  if (!actionType || !action) return json({ ok: false, error: 'action_required' }, 400)

  let canonical: Json
  let summary: string

  if (actionType === 'callback_request') {
    if (!context.externalPhone) return json({ ok: false, error: 'callback_phone_unavailable' }, 409)
    canonical = {
      requested_for: validIso(action.requested_for),
      reason_safe: cleanString(action.reason, 500),
    }
    summary = canonical.requested_for
      ? `Request a callback for ${String(canonical.requested_for)}.`
      : 'Request a callback at the caller’s verified call-back number.'
  } else if (actionType === 'appointment_request') {
    const customerId = await verifiedCustomerId(env, context)
    if (!customerId) return json({ ok: false, error: 'verified_identity_required' }, 403)
    const startsAt = validIso(action.starts_at)
    const endsAt = validIso(action.ends_at)
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      return json({ ok: false, error: 'valid_appointment_window_required' }, 400)
    }
    canonical = {
      customer_id: customerId,
      starts_at: startsAt,
      ends_at: endsAt,
      title_safe: cleanString(action.title, 160) ?? 'Appointment',
    }
    summary = `Schedule ${String(canonical.title_safe)} from ${startsAt} to ${endsAt}.`
  } else if (actionType === 'transfer_request') {
    const destinationKey = cleanString(action.destination_key, 80)
    if (!destinationKey) return json({ ok: false, error: 'destination_key_required' }, 400)
    const destination = await queryOne<{ id: string; display_name: string }>(
      env,
      `select id::text as id, display_name
         from transfer_destinations
        where tenant_id = $1::uuid
          and destination_key = $2
          and active = true
        limit 1`,
      [context.tenantId, destinationKey],
    )
    if (!destination) return json({ ok: false, error: 'transfer_destination_not_authorized' }, 403)
    canonical = { destination_key: destinationKey }
    summary = `Transfer this call to ${destination.display_name}.`
  } else {
    return json({ ok: false, error: 'unsupported_action_type' }, 400)
  }

  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const row = await queryOne<{ action_id: string; expires_at: string }>(
    env,
    `insert into confirmation_tokens
       (tenant_id, call_context_id, action_type, action_payload, token_hash, summary_safe, expires_at)
     values ($1::uuid, $2, $3, $4::jsonb, $5, $6, now() + interval '2 minutes')
     returning action_id::text, expires_at::text`,
    [context.tenantId, context.session.call_context_id, actionType, JSON.stringify(canonical), tokenHash, summary],
  )
  if (!row) return json({ ok: false, error: 'prepare_failed' }, 500)

  await auditTool(env, context, 'prepare_action', 'prepared', startedAt, { action_type: actionType })
  return json({
    ok: true,
    action_id: row.action_id,
    summary,
    requires_explicit_confirmation: true,
    confirmation_token: token,
    confirmation_expires_at: row.expires_at,
  })
}

type ClaimedAction = { action_type: string; action_payload: Json }

async function claimAction(
  env: ToolEnv,
  context: ToolContext,
  actionId: string,
  token: string,
): Promise<ClaimedAction | null> {
  const tokenHash = await sha256Hex(token)
  return queryOne<ClaimedAction>(
    env,
    `update confirmation_tokens
        set consumed_at = now()
      where tenant_id = $1::uuid
        and call_context_id = $2
        and action_id = $3::uuid
        and token_hash = $4
        and consumed_at is null
        and expires_at > now()
      returning action_type, action_payload`,
    [context.tenantId, context.session.call_context_id, actionId, tokenHash],
  )
}

async function commitNonTransferAction(
  env: ToolEnv,
  context: ToolContext,
  claimed: ClaimedAction,
): Promise<{ status: string; reference: string; summary: string }> {
  const payload = claimed.action_payload

  if (claimed.action_type === 'callback_request') {
    if (!context.externalPhone) throw new Error('callback_phone_unavailable')
    const row = await queryOne<{ id: string }>(
      env,
      `insert into callbacks
         (tenant_id, call_context_id, normalized_phone, requested_for, reason_safe)
       values ($1::uuid, $2, $3, $4::timestamptz, $5)
       returning id::text`,
      [
        context.tenantId,
        context.session.call_context_id,
        context.externalPhone,
        payload.requested_for ?? null,
        payload.reason_safe ?? null,
      ],
    )
    if (!row) throw new Error('callback_create_failed')
    return { status: 'requested', reference: row.id, summary: 'Callback request recorded.' }
  }

  if (claimed.action_type === 'appointment_request') {
    const row = await queryOne<{ id: string }>(
      env,
      `insert into appointments
         (tenant_id, customer_id, call_context_id, title_safe, starts_at, ends_at, status)
       values ($1::uuid, $2::uuid, $3, $4, $5::timestamptz, $6::timestamptz, 'scheduled')
       returning id::text`,
      [
        context.tenantId,
        payload.customer_id,
        context.session.call_context_id,
        payload.title_safe,
        payload.starts_at,
        payload.ends_at,
      ],
    )
    if (!row) throw new Error('appointment_create_failed')
    return { status: 'scheduled', reference: row.id, summary: 'Appointment scheduled.' }
  }

  throw new Error('unsupported_committed_action')
}

async function executeTransfer(
  env: ToolEnv,
  context: ToolContext,
  claimed: ClaimedAction,
): Promise<{ status: string; reference: string; summary: string }> {
  if (claimed.action_type !== 'transfer_request') throw new Error('prepared_action_is_not_transfer')
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) throw new Error('twilio_transfer_not_configured')

  const destinationKey = cleanString(claimed.action_payload.destination_key, 80)
  const destination = destinationKey
    ? await queryOne<{ id: string; e164_phone: string }>(
      env,
      `select id::text as id, e164_phone
         from transfer_destinations
        where tenant_id = $1::uuid
          and destination_key = $2
          and active = true
        limit 1`,
      [context.tenantId, destinationKey],
    )
    : null
  if (!destination || !/^\+[1-9]\d{7,14}$/.test(destination.e164_phone)) {
    throw new Error('transfer_destination_not_authorized')
  }

  const transfer = await queryOne<{ id: string }>(
    env,
    `insert into transfers
       (tenant_id, call_context_id, destination_id, status, twilio_call_sid)
     values ($1::uuid, $2, $3::uuid, 'executing', $4)
     returning id::text`,
    [context.tenantId, context.session.call_context_id, destination.id, context.session.call_sid],
  )
  if (!transfer) throw new Error('transfer_create_failed')

  const twiml = `<Response><Dial>${destination.e164_phone}</Dial></Response>`
  const params = new URLSearchParams({ Twiml: twiml })
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Calls/${encodeURIComponent(context.session.call_sid)}.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: params.toString(),
    },
  )

  if (!response.ok) {
    await queryRows(
      env,
      `update transfers set status = 'failed', failure_reason = $3, updated_at = now()
        where tenant_id = $1::uuid and id = $2::uuid`,
      [context.tenantId, transfer.id, `twilio_${response.status}`],
    )
    throw new Error('twilio_transfer_failed')
  }

  return { status: 'transfer_started', reference: transfer.id, summary: 'Transfer started.' }
}

async function commitAction(
  env: ToolEnv,
  context: ToolContext,
  body: Json,
  startedAt: number,
  transferOnly: boolean,
): Promise<Response> {
  const actionId = cleanString(body.action_id, 160)
  const token = cleanString(body.confirmation_token, 512)
  const confirmed = body.confirmed === true
  if (!actionId || !token || !confirmed) return json({ ok: false, error: 'explicit_confirmation_required' }, 409)
  if (!/^[0-9a-fA-F-]{36}$/.test(actionId)) return json({ ok: false, error: 'invalid_action_id' }, 400)

  const claimed = await claimAction(env, context, actionId, token)
  if (!claimed) return json({ ok: false, error: 'invalid_expired_or_consumed_confirmation' }, 409)

  try {
    const result = transferOnly
      ? await executeTransfer(env, context, claimed)
      : await commitNonTransferAction(env, context, claimed)
    await auditTool(env, context, transferOnly ? 'transfer' : 'commit_action', result.status, startedAt, {
      action_type: claimed.action_type,
    })
    return json({ ok: true, ...result })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'action_failed'
    await auditTool(env, context, transferOnly ? 'transfer' : 'commit_action', 'failed', startedAt, {
      action_type: claimed.action_type,
      error_code: code.slice(0, 120),
    })
    return json({ ok: false, error: code }, 502)
  }
}

export async function handleElevenLabsTool(request: Request, env: ToolEnv, pathname: string): Promise<Response> {
  const parsed = await parseToolRequest(request, env)
  if (parsed instanceof Response) return parsed
  const { body, context, startedAt } = parsed

  try {
    if (pathname === '/elevenlabs/tools/customer-lookup') return customerLookup(env, context, startedAt)
    if (pathname === '/elevenlabs/tools/search-knowledge') return searchKnowledge(env, context, body, startedAt)
    if (pathname === '/elevenlabs/tools/get-availability') return getAvailability(env, context, startedAt)
    if (pathname === '/elevenlabs/tools/prepare-action') return prepareAction(env, context, body, startedAt)
    if (pathname === '/elevenlabs/tools/commit-action') return commitAction(env, context, body, startedAt, false)
    if (pathname === '/elevenlabs/tools/transfer') return commitAction(env, context, body, startedAt, true)
    return json({ ok: false, error: 'tool_not_found' }, 404)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'tool_failed'
    await auditTool(env, context, pathname.split('/').at(-1) ?? 'unknown', 'failed', startedAt, {
      error_code: code.slice(0, 120),
    })
    return json({ ok: false, error: code }, code.includes('missing') || code.includes('configured') ? 503 : 500)
  }
}
