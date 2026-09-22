import type { Env, MockSession } from './types.ts'

const PREFIX = 'mock-core/v1'

export function sessionKey(conversationId: string): string {
  return `${PREFIX}/sessions/${encodeURIComponent(conversationId)}.json`
}

export async function putSession(env: Env, session: MockSession): Promise<boolean> {
  if (!env.MOCK_STATE) return false
  await env.MOCK_STATE.put(sessionKey(session.conversation_id), JSON.stringify(session), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { kind: 'mock_session', conversation_id: session.conversation_id },
  })
  return true
}

export async function getSession(env: Env, conversationId: string): Promise<MockSession | null> {
  if (!env.MOCK_STATE) return null
  const object = await env.MOCK_STATE.get(sessionKey(conversationId))
  if (!object) return null
  try {
    const value = JSON.parse(await object.text()) as MockSession
    return value?.schema_version === '1' && value.conversation_id === conversationId ? value : null
  } catch {
    return null
  }
}

export async function putEventReceipt(env: Env, eventId: string, receipt: Record<string, unknown>): Promise<boolean> {
  if (!env.MOCK_STATE) return false
  await env.MOCK_STATE.put(`${PREFIX}/events/${encodeURIComponent(eventId)}.json`, JSON.stringify(receipt), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { kind: 'mock_event_receipt', event_id: eventId },
  })
  return true
}
