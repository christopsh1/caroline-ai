export type CallDirection = 'inbound' | 'outbound'

export type CallSessionState = {
  call_context_id: string
  call_sid: string
  direction?: CallDirection
  selected_agent_id?: string
  elevenlabs_conversation_id?: string
  from_number?: string
  to_number?: string
  register_status?: 'pending' | 'registering' | 'registered' | 'register_failed'
  call_status?: string
  answered_by?: string
  registered_at?: string
  expires_at?: string
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
        call_context_id: patch.call_context_id ?? current?.call_context_id ?? '',
        call_sid: patch.call_sid ?? current?.call_sid ?? '',
        created_at: current?.created_at ?? patch.created_at ?? now,
        updated_at: now,
      }
      if (!next.call_context_id || !next.call_sid) return new Response('call_mapping_required', { status: 400 })
      await this.state.storage.put('call', next)
      return Response.json(next)
    }

    return new Response('method_not_allowed', { status: 405 })
  }
}

function stub(binding: CallSessionBinding, key: string): DurableObjectStubLike {
  return binding.get(binding.idFromName(key))
}

async function writeState(binding: CallSessionBinding, key: string, state: Partial<CallSessionState>): Promise<CallSessionState> {
  const response = await stub(binding, key).fetch('https://call-session.internal/state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(state),
  })
  if (!response.ok) throw new Error(`call_session_update_${response.status}`)
  return (await response.json()) as CallSessionState
}

export async function getCallSession(binding: CallSessionBinding, key: string): Promise<CallSessionState | null> {
  const response = await stub(binding, key).fetch('https://call-session.internal/state')
  if (!response.ok) throw new Error(`call_session_get_${response.status}`)
  return (await response.json()) as CallSessionState | null
}

export async function createCallMapping(
  binding: CallSessionBinding,
  state: Omit<CallSessionState, 'created_at' | 'updated_at'>,
): Promise<CallSessionState> {
  const existing = await getCallSession(binding, state.call_sid)
  const canonical = existing ?? (await writeState(binding, state.call_sid, state))
  await writeState(binding, canonical.call_context_id, canonical)
  return canonical
}

async function mirrorState(binding: CallSessionBinding, current: CallSessionState, patch: Partial<CallSessionState>): Promise<CallSessionState> {
  const next = await writeState(binding, current.call_sid, { ...current, ...patch })
  await writeState(binding, next.call_context_id, next)
  return next
}

export async function patchCallSession(
  binding: CallSessionBinding,
  callSid: string,
  patch: Partial<CallSessionState>,
): Promise<CallSessionState> {
  const current = await getCallSession(binding, callSid)
  if (!current) throw new Error('call_session_not_found')
  return mirrorState(binding, current, patch)
}

export async function patchCallSessionByContext(
  binding: CallSessionBinding,
  callContextId: string,
  patch: Partial<CallSessionState>,
): Promise<CallSessionState> {
  const current = await getCallSession(binding, callContextId)
  if (!current) throw new Error('call_context_not_found')
  return mirrorState(binding, current, patch)
}
