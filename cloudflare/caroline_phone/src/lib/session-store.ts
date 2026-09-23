import type { Env } from '../types.ts'
import type { CarolineSessionState } from './session-model.ts'
import { isSessionState } from './session-model.ts'

function stub(env: Env, conversationId: string): DurableObjectStub | null {
  if (!env.CAROLINE_SESSIONS) return null
  return env.CAROLINE_SESSIONS.getByName(`conversation:${conversationId}`)
}

async function parseSessionResponse(response: Response): Promise<CarolineSessionState | null> {
  if (!response.ok) return null
  let value: unknown
  try { value = await response.json() } catch { return null }
  return isSessionState(value) ? value : null
}

export async function persistSession(env: Env, session: CarolineSessionState): Promise<'ok' | 'not_configured' | 'failed'> {
  const target = stub(env, session.conversation_id)
  if (!target) return 'not_configured'
  try {
    const response = await target.fetch(new Request('https://session.internal/v1/session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    }))
    return response.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

export async function loadSession(env: Env, conversationId: string): Promise<'not_configured' | CarolineSessionState | null> {
  const target = stub(env, conversationId)
  if (!target) return 'not_configured'
  try {
    return parseSessionResponse(await target.fetch(new Request('https://session.internal/v1/session')))
  } catch {
    return null
  }
}

export async function activateSessionHold(
  env: Env,
  conversationId: string,
  input: { reason_code?: string; reason_summary?: string },
): Promise<'not_configured' | CarolineSessionState | null> {
  const target = stub(env, conversationId)
  if (!target) return 'not_configured'
  try {
    const response = await target.fetch(new Request('https://session.internal/v1/session/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }))
    return parseSessionResponse(response)
  } catch {
    return null
  }
}

export async function acknowledgeSessionReentry(env: Env, conversationId: string): Promise<'not_configured' | CarolineSessionState | null> {
  const target = stub(env, conversationId)
  if (!target) return 'not_configured'
  try {
    const response = await target.fetch(new Request('https://session.internal/v1/session/reentry-ack', { method: 'POST' }))
    return parseSessionResponse(response)
  } catch {
    return null
  }
}
