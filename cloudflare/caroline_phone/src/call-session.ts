export type CallDirection = 'inbound' | 'outbound'

export type CallSessionState = {
  call_sid: string
  direction?: CallDirection
  from_number?: string
  to_number?: string
  register_status?: 'registering' | 'registered' | 'register_failed'
  call_status?: string
  answered_by?: string
  registered_at?: string
  created_at: string
  updated_at: string
}

type DurableObjectStorageLike = {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

type DurableObjectStateLike = {
  storage: DurableObjectStorageLike
}

type DurableObjectIdLike = unknown

type DurableObjectStubLike = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export type CallSessionBinding = {
  idFromName(name: string): DurableObjectIdLike
  get(id: DurableObjectIdLike): DurableObjectStubLike
}

export class CallSession {
  constructor(private readonly state: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/state') return new Response('not_found', { status: 404 })

    if (request.method === 'GET') {
      const current = await this.state.storage.get<CallSessionState>('call')
      return Response.json(current ?? null)
    }

    if (request.method === 'PATCH') {
      const patch = (await request.json()) as Partial<CallSessionState>
      const current = await this.state.storage.get<CallSessionState>('call')
      const now = new Date().toISOString()
      const next: CallSessionState = {
        ...(current ?? ({} as CallSessionState)),
        ...patch,
        call_sid: patch.call_sid ?? current?.call_sid ?? '',
        created_at: current?.created_at ?? patch.created_at ?? now,
        updated_at: now,
      }
      if (!next.call_sid) return new Response('call_sid_required', { status: 400 })
      await this.state.storage.put('call', next)
      return Response.json(next)
    }

    return new Response('method_not_allowed', { status: 405 })
  }
}

export async function patchCallSession(
  binding: CallSessionBinding,
  callSid: string,
  patch: Partial<CallSessionState>,
): Promise<void> {
  const id = binding.idFromName(callSid)
  const stub = binding.get(id)
  const response = await stub.fetch('https://call-session.internal/state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ call_sid: callSid, ...patch }),
  })
  if (!response.ok) throw new Error(`call_session_update_${response.status}`)
}
