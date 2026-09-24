const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const MAX_EVENT_TYPE_LENGTH = 120
const EVENT_TYPE_PATTERN = /^[a-zA-Z0-9._:-]+$/

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function eventKey(id) {
  return `event:${id}`
}

function getRuntimeAuthKeys(env) {
  const keys = [env.CAROLINE_KEY, env.CORE_RUNTIME_KEY]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)

  return [...new Set(keys)]
}

function authorizedRequest(request, env) {
  const expectedKeys = getRuntimeAuthKeys(env)
  if (expectedKeys.length === 0) {
    return { ok: false, status: 503, error: 'runtime_auth_not_configured' }
  }

  const supplied = request.headers.get('x-caroline-key')?.trim()
  if (!supplied) {
    return { ok: false, status: 401, error: 'missing_runtime_key' }
  }

  if (!expectedKeys.includes(supplied)) {
    return { ok: false, status: 401, error: 'invalid_runtime_key' }
  }

  return { ok: true }
}

function readRequestId(request) {
  const fromHeader = request.headers.get('x-request-id')?.trim()
  return fromHeader || crypto.randomUUID()
}

function normalizeEventType(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > MAX_EVENT_TYPE_LENGTH) return null
  if (!EVENT_TYPE_PATTERN.test(normalized)) return null
  return normalized
}

function normalizeOptionalString(value, maxLength = 200) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maxLength) return null
  return normalized
}

function buildHealth(env) {
  const authKeys = getRuntimeAuthKeys(env)
  return {
    ok: true,
    service: 'caroline-event-worker',
    timestamp: new Date().toISOString(),
    bindings: {
      kv: Boolean(env.CAROLINE_PHONE),
      queue: Boolean(env.EVENT_DELIVERY),
      d1: Boolean(env.CAROLINE_DB),
      events_raw: Boolean(env.CAROLINE_EVENTS_RAW),
      transcripts: Boolean(env.CAROLINE_TRANSCRIPTS),
      artifacts: Boolean(env.CAROLINE_ARTIFACTS),
      media: Boolean(env.CAROLINE_MEDIA),
    },
    integrations: {
      runtime_auth_configured: authKeys.length > 0,
      downstream_ingest_configured: Boolean(env.SUPABASE_EVENT_INGEST_URL),
    },
  }
}

async function createEvent(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, error: 'object_body_required' }, 400)
  }

  const type = normalizeEventType(body.type)
  if (!type) {
    return json({ ok: false, error: 'invalid_event_type' }, 400)
  }

  const source = normalizeOptionalString(body.source, 120)
  const conversationId = normalizeOptionalString(body.conversation_id, 120)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const requestId = readRequestId(request)

  const event = {
    id,
    request_id: requestId,
    type,
    source,
    conversation_id: conversationId,
    payload: body.payload ?? null,
    status: 'queued',
    created_at: now,
    updated_at: now,
    delivered_at: null,
    delivery_attempts: 0,
    last_delivery_error: null,
  }

  await env.CAROLINE_PHONE.put(eventKey(id), JSON.stringify(event))

  try {
    await env.EVENT_DELIVERY.send({
      event_id: id,
      request_id: requestId,
      type,
      enqueued_at: now,
    })
  } catch {
    event.status = 'queue_failed'
    event.updated_at = new Date().toISOString()
    event.last_delivery_error = 'queue_send_failed'
    await env.CAROLINE_PHONE.put(eventKey(id), JSON.stringify(event))
    return json({ ok: false, event_id: id, status: event.status, error: 'queue_send_failed' }, 503)
  }

  return json({ ok: true, event_id: id, status: event.status, request_id: requestId }, 201)
}

async function getEvent(id, env) {
  const raw = await env.CAROLINE_PHONE.get(eventKey(id))
  if (!raw) return json({ ok: false, error: 'event_not_found' }, 404)

  try {
    return json({ ok: true, event: JSON.parse(raw) })
  } catch {
    return json({ ok: false, error: 'event_corrupt' }, 500)
  }
}

function ingestRequest(event, env) {
  const url = env.SUPABASE_EVENT_INGEST_URL?.trim()
  if (!url) return null

  const authKey = env.SUPABASE_EVENT_INGEST_KEY?.trim() || env.CORE_RUNTIME_KEY?.trim() || env.CAROLINE_KEY?.trim()
  if (!authKey) {
    throw new Error('downstream_auth_missing')
  }

  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-caroline-key': authKey,
    },
    body: JSON.stringify({
      event_id: event.id,
      type: event.type,
      source: event.source,
      conversation_id: event.conversation_id,
      payload: event.payload,
      worker_status: event.status,
      created_at: event.created_at,
      updated_at: event.updated_at,
      request_id: event.request_id,
    }),
  })
}

async function processQueuedEvent(eventId, env) {
  const raw = await env.CAROLINE_PHONE.get(eventKey(eventId))
  if (!raw) return { action: 'ack' }

  let event
  try {
    event = JSON.parse(raw)
  } catch {
    return { action: 'ack' }
  }

  if (event.status === 'delivered') {
    return { action: 'ack' }
  }

  const now = new Date().toISOString()
  event.delivery_attempts = Number.isFinite(Number(event.delivery_attempts)) ? Number(event.delivery_attempts) + 1 : 1
  event.updated_at = now

  try {
    const downstream = ingestRequest(event, env)
    if (downstream) {
      const response = await downstream
      if (!response.ok) {
        event.status = 'delivery_retrying'
        event.last_delivery_error = `downstream_http_${response.status}`
        await env.CAROLINE_PHONE.put(eventKey(eventId), JSON.stringify(event))
        return { action: 'retry' }
      }
    }

    event.status = 'delivered'
    event.delivered_at = now
    event.last_delivery_error = null
    await env.CAROLINE_PHONE.put(eventKey(eventId), JSON.stringify(event))
    return { action: 'ack' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'delivery_failed'
    event.status = 'delivery_retrying'
    event.last_delivery_error = reason
    await env.CAROLINE_PHONE.put(eventKey(eventId), JSON.stringify(event))
    return { action: 'retry' }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(buildHealth(env))
      }

      if (request.method === 'POST' && url.pathname === '/events') {
        const auth = authorizedRequest(request, env)
        if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status)
        return await createEvent(request, env)
      }

      if (request.method === 'GET' && url.pathname.startsWith('/events/')) {
        const auth = authorizedRequest(request, env)
        if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status)

        const id = decodeURIComponent(url.pathname.slice('/events/'.length)).trim()
        if (!id) return json({ ok: false, error: 'event_id_required' }, 400)
        return await getEvent(id, env)
      }

      return json({ ok: false, error: 'not_found' }, 404)
    } catch {
      return json({ ok: false, error: 'internal_error' }, 500)
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      const eventId = message.body?.event_id
      if (typeof eventId !== 'string' || !eventId.trim()) {
        message.ack()
        continue
      }

      const result = await processQueuedEvent(eventId.trim(), env)
      if (result.action === 'ack') {
        message.ack()
      } else {
        message.retry()
      }
    }
  },
}
