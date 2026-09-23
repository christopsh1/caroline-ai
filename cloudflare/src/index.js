const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function eventKey(id) {
  return `event:${id}`
}

async function createEvent(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!body || typeof body !== 'object' || typeof body.type !== 'string' || !body.type.trim()) {
    return json({ ok: false, error: 'type_required' }, 400)
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const event = {
    id,
    type: body.type.trim(),
    payload: body.payload ?? null,
    status: 'queued',
    created_at: now,
    updated_at: now,
    delivered_at: null,
  }

  await env.CAROLINE_PHONE.put(eventKey(id), JSON.stringify(event))

  try {
    await env.EVENT_DELIVERY.send({ event_id: id })
  } catch {
    event.status = 'queue_failed'
    event.updated_at = new Date().toISOString()
    await env.CAROLINE_PHONE.put(eventKey(id), JSON.stringify(event))
    return json({ ok: false, event_id: id, status: event.status, error: 'queue_send_failed' }, 503)
  }

  return json({ ok: true, event_id: id, status: event.status }, 201)
}

async function getEvent(id, env) {
  const raw = await env.CAROLINE_PHONE.get(eventKey(id))
  if (!raw) return json({ ok: false, error: 'event_not_found' }, 404)
  return json({ ok: true, event: JSON.parse(raw) })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({
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
        })
      }

      if (request.method === 'POST' && url.pathname === '/events') {
        return await createEvent(request, env)
      }

      if (request.method === 'GET' && url.pathname.startsWith('/events/')) {
        const id = decodeURIComponent(url.pathname.slice('/events/'.length))
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
      if (typeof eventId !== 'string' || !eventId) {
        message.ack()
        continue
      }

      try {
        const raw = await env.CAROLINE_PHONE.get(eventKey(eventId))
        if (!raw) {
          message.ack()
          continue
        }

        const event = JSON.parse(raw)
        const now = new Date().toISOString()
        event.status = 'delivered'
        event.updated_at = now
        event.delivered_at = now
        await env.CAROLINE_PHONE.put(eventKey(eventId), JSON.stringify(event))
        message.ack()
      } catch {
        message.retry()
      }
    }
  },
}
