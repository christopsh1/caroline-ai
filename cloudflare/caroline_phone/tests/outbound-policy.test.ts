import assert from 'node:assert/strict'
import test from 'node:test'
import { setDatabaseQueryForTests, type DatabaseQueryExecutor } from '../src/database'
import { outboundAllowed } from '../src/persistence'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ENV = {
  DATABASE_URL: 'postgresql://test.invalid/caroline',
  CAROLINE_TENANT_KEY: 'caroline',
}

function executorFor(mode: 'allowed' | 'dnc' | 'contact_restricted'): DatabaseQueryExecutor {
  return async <T extends Record<string, unknown>>(text: string) => {
    const sql = text.replace(/\s+/g, ' ').trim().toLowerCase()
    if (sql.includes('from tenants')) return [{ id: TENANT_ID }] as T[]
    if (sql.includes('from dnc_records')) return (mode === 'dnc' ? [{ blocked: true }] : []) as T[]
    if (sql.includes('from caller_identity_links')) return (mode === 'contact_restricted' ? [{ blocked: true }] : []) as T[]
    return [] as T[]
  }
}

test.afterEach(() => setDatabaseQueryForTests(null))

test('outbound policy permits an authorized number with no DNC or contact restriction', async () => {
  setDatabaseQueryForTests(executorFor('allowed'))
  assert.equal(await outboundAllowed(ENV, '+15550000003'), true)
})

test('outbound policy blocks an active DNC record', async () => {
  setDatabaseQueryForTests(executorFor('dnc'))
  assert.equal(await outboundAllowed(ENV, '+15550000003'), false)
})

test('outbound policy blocks a customer/contact voice restriction', async () => {
  setDatabaseQueryForTests(executorFor('contact_restricted'))
  assert.equal(await outboundAllowed(ENV, '+15550000003'), false)
})
