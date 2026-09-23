const base = process.env.WORKER_URL?.replace(/\/$/, '')
const key = process.env.CAROLINE_KEY
if (!base) throw new Error('WORKER_URL is required')
if (!key) throw new Error('CAROLINE_KEY is required')

async function readJson(res) {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { raw: text } }
}

const health = await fetch(`${base}/health`)
const healthBody = await readJson(health)
if (!health.ok || healthBody?.ok !== true) throw new Error(`health failed: ${health.status}`)

const unauthenticated = await fetch(`${base}/runtime/init`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"conversation_id":"smoke"}',
})
if (unauthenticated.status !== 403) throw new Error(`unauthenticated runtime gate failed: ${unauthenticated.status}`)

const status = await fetch(`${base}/status`, { headers: { 'x-caroline-key': key } })
const statusBody = await readJson(status)
if (!status.ok || statusBody?.ok !== true) throw new Error(`status failed: ${status.status}`)

console.log(JSON.stringify({
  ok: true,
  health_status: health.status,
  unauthenticated_runtime_status: unauthenticated.status,
  status_status: status.status,
  release: statusBody.release,
  environment: statusBody.environment,
  configured: statusBody.configured,
}, null, 2))
