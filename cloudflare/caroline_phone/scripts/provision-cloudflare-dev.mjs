const token = process.env.CLOUDFLARE_API_TOKEN
const expectedAccountId = '882fc7501e4632c7c58879d5c1d5b672'
const expectedKvId = '85679a0030e846ee931226aa1a6e6332'
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || expectedAccountId
const apply = process.argv.includes('--apply')

if (!token) {
  console.error('CLOUDFLARE_API_TOKEN is required.')
  process.exit(2)
}
if (accountId !== expectedAccountId) throw new Error('Cloudflare account ID does not match the configured Caroline account.')

const apiBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`

async function cf(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    const detail = payload?.errors?.map((e) => e.message || e.code).join('; ') || `HTTP ${response.status}`
    throw new Error(`${options.method || 'GET'} ${path} failed: ${detail}`)
  }
  return payload.result
}

function listFrom(result, keys = []) {
  if (Array.isArray(result)) return result
  for (const key of keys) if (Array.isArray(result?.[key])) return result[key]
  return []
}

function nameOf(value) {
  return value?.name || value?.queue_name || value?.id || value?.title || null
}

const [workersResult, kvResult, r2Result, queuesResult] = await Promise.all([
  cf('/workers/scripts'),
  cf('/storage/kv/namespaces'),
  cf('/r2/buckets'),
  cf('/queues'),
])

const workers = listFrom(workersResult, ['scripts'])
const kvNamespaces = listFrom(kvResult, ['namespaces'])
const r2Buckets = listFrom(r2Result, ['buckets'])
const queues = listFrom(queuesResult, ['queues'])

const phoneKv = kvNamespaces.find((item) => item?.title === 'Caroline_Phone')
if (!phoneKv?.id) throw new Error('Existing KV namespace `Caroline_Phone` was not found. Refusing to create a substitute.')
if (phoneKv.id !== expectedKvId) throw new Error('Existing `Caroline_Phone` KV ID does not match the configured production identifier.')

const desiredBuckets = ['caroline-phone-payloads-dev']
const desiredQueues = ['caroline-phone-events-dev', 'caroline-phone-events-dev-dlq']
const missingBuckets = desiredBuckets.filter((name) => !r2Buckets.some((item) => nameOf(item) === name))
const missingQueues = desiredQueues.filter((name) => !queues.some((item) => nameOf(item) === name))

if (apply) {
  for (const name of missingBuckets) {
    await cf('/r2/buckets', { method: 'POST', body: JSON.stringify({ name }) })
    console.log(`created R2 bucket: ${name}`)
  }
  for (const queue_name of missingQueues) {
    await cf('/queues', { method: 'POST', body: JSON.stringify({ queue_name }) })
    console.log(`created Queue: ${queue_name}`)
  }
}

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'inventory-only',
  account_id: accountId,
  existing_workers: workers.map(nameOf).filter(Boolean),
  caroline_phone_kv: { title: phoneKv.title, id: phoneKv.id },
  desired_dev_resources: { r2: desiredBuckets, queues: desiredQueues },
  missing_before_apply: { r2: missingBuckets, queues: missingQueues },
  next: apply
    ? 'Re-list resources and deploy caroline-phone-dev only after real runtime URLs/policy and Worker secrets are configured.'
    : 'Review inventory. Re-run with --apply to create only missing Caroline phone development R2/Queue resources.',
}, null, 2))
