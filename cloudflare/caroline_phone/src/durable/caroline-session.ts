import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types.ts'
import {
  applyCurrentSessionHold,
  applyReentryAcknowledgement,
  isSessionState,
  type CarolineSessionState,
} from '../lib/session-model.ts'

const SESSION_KEY = 'session:v1'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function readJson(req: Request, maxBytes = 32 * 1024): Promise<unknown | null> {
  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.byteLength > maxBytes) return null
  try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { return null }
}

export class CarolineSession extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/v1/session' && req.method === 'GET') {
      const existing = await this.ctx.storage.get<CarolineSessionState>(SESSION_KEY)
      return existing && isSessionState(existing) ? json(existing) : json({ error: 'not_found' }, 404)
    }

    if (url.pathname === '/v1/session' && req.method === 'PUT') {
      const incoming = await readJson(req, 64 * 1024)
      if (!isSessionState(incoming)) return json({ error: 'invalid_session' }, 400)
      const existing = await this.ctx.storage.get<CarolineSessionState>(SESSION_KEY)
      if (existing && isSessionState(existing) && existing.conversation_id !== incoming.conversation_id) {
        return json({ error: 'conversation_mismatch' }, 409)
      }
      const persisted: CarolineSessionState = existing && isSessionState(existing)
        ? { ...incoming, created_at: existing.created_at, updated_at: new Date().toISOString() }
        : incoming
      await this.ctx.storage.put(SESSION_KEY, persisted)
      return json(persisted)
    }

    if (url.pathname === '/v1/session/hold' && req.method === 'POST') {
      const existing = await this.ctx.storage.get<CarolineSessionState>(SESSION_KEY)
      if (!existing || !isSessionState(existing)) return json({ error: 'not_found' }, 404)
      const value = await readJson(req)
      const body = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
      const reasonCode = typeof body.reason_code === 'string' ? body.reason_code.slice(0, 80) : undefined
      const reasonSummary = typeof body.reason_summary === 'string' ? body.reason_summary.slice(0, 1000) : undefined
      const updated = applyCurrentSessionHold(existing, reasonCode, reasonSummary)
      if (!updated) return json({ error: 'forbidden' }, 403)
      await this.ctx.storage.put(SESSION_KEY, updated)
      return json(updated)
    }

    if (url.pathname === '/v1/session/reentry-ack' && req.method === 'POST') {
      const existing = await this.ctx.storage.get<CarolineSessionState>(SESSION_KEY)
      if (!existing || !isSessionState(existing)) return json({ error: 'not_found' }, 404)
      const updated = applyReentryAcknowledgement(existing)
      if (!updated) return json({ error: 'forbidden' }, 403)
      await this.ctx.storage.put(SESSION_KEY, updated)
      return json(updated)
    }

    return json({ error: 'not_found' }, 404)
  }
}
