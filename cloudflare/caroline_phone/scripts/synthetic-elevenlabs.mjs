import { createHmac } from 'node:crypto'

const base = process.env.WORKER_URL?.replace(/\/$/, '')
const secret = process.env.ELEVENLABS_WEBHOOK_SECRET
if (!base) throw new Error('WORKER_URL is required')
if (!secret) throw new Error('ELEVENLABS_WEBHOOK_SECRET is required')

const timestamp = Math.floor(Date.now() / 1000)
const body = JSON.stringify({
  type: 'post_call_transcription',
  event_timestamp: timestamp,
  data: {
    conversation_id: `synthetic_${crypto.randomUUID()}`,
    synthetic_fixture: true,
  },
})
const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')

const response = await fetch(`${base}/webhook/elevenlabs`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'ElevenLabs-Signature': `t=${timestamp},v0=${digest}`,
  },
  body,
})
const text = await response.text()
let parsed
try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }

const hmacAccepted = response.ok || parsed?.error === 'sink_not_configured' || parsed?.error === 'sink_auth_not_configured'
if (!hmacAccepted) {
  throw new Error(`synthetic HMAC fixture rejected: ${response.status} ${text}`)
}

console.log(JSON.stringify({
  ok: true,
  hmac_accepted: true,
  worker_status: response.status,
  worker_response: parsed,
}, null, 2))
