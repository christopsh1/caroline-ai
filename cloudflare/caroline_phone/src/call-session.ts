export interface CallState {
  call_sid?: string
  direction?: 'inbound' | 'outbound'
  from_number?: string
  to_number?: string
  status?: string
  answered_by?: string
  outbound_call_brief_json?: string
  created_at?: string
  updated_at?: string
  registered_at?: string
  completed_at?: string
}

const STATE_KEY = 'call_state'

export class CallSession {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/state') return new Response('not found', { status: 404 })

    if (request.method === 'GET') {
      const value = (await this.state.storage.get<CallState>(STATE_KEY)) ?? null
      return Response.json({ ok: true, state: value })
    }

    if (request.method === 'POST') {
      const patch = (await request.json()) as CallState
      const previous = (await this.state.storage.get<CallState>(STATE_KEY)) ?? {}
      const now = new Date().toISOString()
      const next: CallState = {
        ...previous,
        ...patch,
        created_at: previous.created_at ?? patch.created_at ?? now,
        updated_at: now,
      }
      await this.state.storage.put(STATE_KEY, next)
      return Response.json({ ok: true, state: next })
    }

    return new Response('method not allowed', { status: 405 })
  }
}
