type StorageLike = {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

type StateLike = { storage: StorageLike }
type StubLike = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }

export type EventLedgerBinding = {
  idFromName(name: string): unknown
  get(id: unknown): StubLike
}

export class EventLedger {
  constructor(private readonly state: StateLike) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/claim' || request.method !== 'POST') {
      return new Response('not_found', { status: 404 })
    }

    const body = (await request.json()) as { event_id?: string }
    const eventId = body.event_id?.trim()
    if (!eventId) return Response.json({ ok: false, error: 'event_id_required' }, { status: 400 })

    const existing = await this.state.storage.get<{ event_id: string; claimed_at: string }>('event')
    if (existing) return Response.json({ ok: true, duplicate: true, event: existing })

    const event = { event_id: eventId, claimed_at: new Date().toISOString() }
    await this.state.storage.put('event', event)
    return Response.json({ ok: true, duplicate: false, event })
  }
}

export async function claimEvent(binding: EventLedgerBinding, eventId: string): Promise<boolean> {
  const stub = binding.get(binding.idFromName(eventId))
  const response = await stub.fetch('https://event-ledger.internal/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event_id: eventId }),
  })
  if (!response.ok) throw new Error(`event_claim_${response.status}`)
  const result = (await response.json()) as { duplicate?: boolean }
  return result.duplicate !== true
}
