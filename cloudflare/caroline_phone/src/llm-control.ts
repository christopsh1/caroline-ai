export type LlmControlState = {
  shared_secret?: string
  elevenlabs_secret_id?: string
  configured_version?: string
  configured_at?: string
  last_error?: string
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

export type LlmControlBinding = {
  idFromName(name: string): DurableObjectIdLike
  get(id: DurableObjectIdLike): DurableObjectStubLike
}

function randomSecret(): string {
  const bytes = new Uint8Array(48)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export class LlmControl {
  constructor(private readonly state: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/state' && url.pathname !== '/ensure-secret') {
      return new Response('not_found', { status: 404 })
    }

    if (request.method === 'GET' && url.pathname === '/state') {
      const current = await this.state.storage.get<LlmControlState>('llm')
      return Response.json(current ?? null)
    }

    if (request.method === 'POST' && url.pathname === '/ensure-secret') {
      const current = await this.state.storage.get<LlmControlState>('llm')
      if (current?.shared_secret) return Response.json(current)
      const now = new Date().toISOString()
      const next: LlmControlState = {
        ...(current ?? {}),
        shared_secret: randomSecret(),
        updated_at: now,
      }
      await this.state.storage.put('llm', next)
      return Response.json(next)
    }

    if (request.method === 'PATCH' && url.pathname === '/state') {
      const patch = (await request.json()) as Partial<LlmControlState>
      const current = await this.state.storage.get<LlmControlState>('llm')
      const next: LlmControlState = {
        ...(current ?? {}),
        ...patch,
        updated_at: new Date().toISOString(),
      }
      await this.state.storage.put('llm', next)
      return Response.json(next)
    }

    return new Response('method_not_allowed', { status: 405 })
  }
}

function stub(binding: LlmControlBinding): DurableObjectStubLike {
  return binding.get(binding.idFromName('caroline-llm-control'))
}

export async function getLlmControlState(binding: LlmControlBinding): Promise<LlmControlState | null> {
  const response = await stub(binding).fetch('https://llm-control.internal/state')
  if (!response.ok) throw new Error(`llm_control_get_${response.status}`)
  return (await response.json()) as LlmControlState | null
}

export async function ensureLlmSharedSecret(binding: LlmControlBinding): Promise<LlmControlState> {
  const response = await stub(binding).fetch('https://llm-control.internal/ensure-secret', { method: 'POST' })
  if (!response.ok) throw new Error(`llm_control_ensure_${response.status}`)
  return (await response.json()) as LlmControlState
}

export async function patchLlmControlState(
  binding: LlmControlBinding,
  patch: Partial<LlmControlState>,
): Promise<LlmControlState> {
  const response = await stub(binding).fetch('https://llm-control.internal/state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error(`llm_control_patch_${response.status}`)
  return (await response.json()) as LlmControlState
}
