import { createClient } from '@supabase/supabase-js'

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const runtimeKey = Deno.env.get('CAROLINE_RUNTIME_KEY')
const db = createClient(supabaseUrl, serviceRoleKey)

const str = (value: unknown, maxLength = 200) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

function authorized(request: Request) {
  if (!runtimeKey) return { ok: false, status: 503 as const, error: 'runtime_auth_not_configured' }
  const supplied = request.headers.get('x-caroline-key')?.trim()
  if (!supplied) return { ok: false, status: 401 as const, error: 'missing_runtime_key' }
  if (supplied !== runtimeKey) return { ok: false, status: 401 as const, error: 'invalid_runtime_key' }
  return { ok: true }
}

Deno.serve(async (request) => {
  const auth = authorized(request)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'object_body_required' }, 400)
  }

  const eventId = str(body.event_id, 120)
  if (!eventId) return json({ error: 'event_id_required' }, 400)

  const eventType = str(body.type, 120)
  if (!eventType) return json({ error: 'event_type_required' }, 400)

  const conversationId = str(body.conversation_id, 120)
  const source = str(body.source, 120)
  const requestId = str(body.request_id, 120)

  const details = {
    source,
    request_id: requestId,
    payload: body.payload ?? null,
    worker_status: str(body.worker_status, 64),
    worker_created_at: str(body.created_at, 64),
    worker_updated_at: str(body.updated_at, 64),
  }

  const { error } = await db.from('events_processed').upsert(
    {
      event_id: eventId,
      event_type: eventType,
      conversation_id: conversationId,
      details,
      telegram_notification_status: 'skipped',
      processed_at: new Date().toISOString(),
    },
    { onConflict: 'event_id' },
  )

  if (error) return json({ error: 'event_write_failed' }, 500)
  return json({ ok: true, event_id: eventId, event_type: eventType }, 200)
})
