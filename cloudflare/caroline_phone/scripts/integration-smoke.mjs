const base = (process.env.EDGE_BASE_URL || '').replace(/\/$/, '')
const key = process.env.CAROLINE_RUNTIME_KEY || ''
if (!base || !key) {
  console.error('Set EDGE_BASE_URL and CAROLINE_RUNTIME_KEY')
  process.exit(2)
}

async function call(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-caroline-key': key },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  if (!response.ok) throw new Error(`${path} -> ${response.status}: ${text}`)
  return parsed
}

const conversationId = `smoke-${Date.now()}`
const init = await call('/runtime/init', { conversation_id: conversationId, caller_id: '+15550000001', interaction_mode: 'inbound_owner' })
if (init?.dynamic_variables?.caller_access_tier !== 'tier_owner') throw new Error('owner init fixture not resolved')

const retrieval = await call('/runtime/retrieve', {
  conversation_id: conversationId,
  caller_phone: '+15550000001',
  interaction_mode: 'inbound_owner',
  current_query: 'integration smoke context',
})
if (retrieval?.authorized !== true) throw new Error('owner retrieval was not authorized')

const sms = await call('/runtime/phone/sms', {
  conversation_id: conversationId,
  to_number: '+15550000999',
  message_summary: 'Synthetic integration smoke message. Do not send externally.',
})
if (sms?.authorized !== true || sms?.accepted !== true || !['queued', 'scheduled'].includes(sms?.disposition)) {
  throw new Error('owner mock SMS was not accepted')
}

const calendar = await call('/runtime/phone/calendar-read', { conversation_id: conversationId, limit: 2 })
if (calendar?.authorized !== true || calendar?.share_level !== 'details') throw new Error('owner calendar fixture failed')

console.log(JSON.stringify({ ok: true, conversation_id: conversationId, checks: ['init', 'retrieval', 'sms', 'calendar'] }, null, 2))
