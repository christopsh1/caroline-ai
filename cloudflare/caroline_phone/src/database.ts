import { neon } from '@neondatabase/serverless'

export type DatabaseEnv = {
  DATABASE_URL?: string
  CAROLINE_TENANT_KEY?: string
}

type Row = Record<string, unknown>

type NeonSql = ReturnType<typeof neon>

let cachedUrl = ''
let cachedSql: NeonSql | null = null

function sqlFor(env: DatabaseEnv): NeonSql {
  const connectionString = env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('database_url_missing')
  if (!cachedSql || cachedUrl !== connectionString) {
    cachedUrl = connectionString
    cachedSql = neon(connectionString)
  }
  return cachedSql
}

export async function queryRows<T extends Row = Row>(
  env: DatabaseEnv,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const sql = sqlFor(env) as NeonSql & {
    query(queryText: string, queryParams?: unknown[]): Promise<T[]>
  }
  return sql.query(text, params)
}

export async function queryOne<T extends Row = Row>(
  env: DatabaseEnv,
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(env, text, params)
  return rows[0] ?? null
}

export async function requireTenantId(env: DatabaseEnv): Promise<string> {
  const tenantKey = env.CAROLINE_TENANT_KEY?.trim() || 'caroline'
  const row = await queryOne<{ id: string }>(
    env,
    `select id::text as id
       from tenants
      where tenant_key = $1
        and status = 'active'
      limit 1`,
    [tenantKey],
  )
  if (!row?.id) throw new Error('tenant_not_configured')
  return row.id
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function vectorLiteral(values: number[], expectedDimensions = 1536): string {
  if (values.length !== expectedDimensions) throw new Error('embedding_dimensions_invalid')
  if (values.some((value) => !Number.isFinite(value))) throw new Error('embedding_contains_non_finite_value')
  return `[${values.join(',')}]`
}
