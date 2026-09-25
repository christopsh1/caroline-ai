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

type EventClaim = {
  event_id: string
  claimed: boolean
  claimed_at?: string
  released_at?: string
}

export class EventLedger {
  constructor(private readonly state: StateLike) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'POST' || !['/claim', '/release'].includes(url.pathname)) {
      return new Response('not_found', { status: 404 })
    }

    const body = (await request.json()) as { event_id?: string }
    const eventId = body.event_id?.trim()
    if (!eventId) return Response.json({ ok: false, error: 'event_id_required' }, { status: 400 })

    const existing = await this.state.storage.get<EventClaim>('event')

    if (url.pathname === '/release') {
      const released: EventClaim = {
        event_id: eventId,
        claimed: false,
        claimed_at: existing?.claimed_at,
        released_at: new Date().toISOString(),
      }
      await this.state.storage.put('event', released)
      return Response.json({ ok: true, released: true })
    }

    if (existing?.claimed) return Response.json({ ok: true, duplicate: true, event: existing })

    const event: EventClaim = {
      event_id: eventId,
      claimed: true,
      claimed_at: new Date().toISOString(),
    }
    await this.state.storage.put('event', event)
    return Response.json({ ok: true, duplicate: false, event })
  }
}

function ledgerStub(binding: EventLedgerBinding, eventId: string) {
  return binding.get(binding.idFromName(eventId))
}

export async function claimEvent(binding: EventLedgerBinding, eventId: string): Promise<boolean> {
  const response = await ledgerStub(binding, eventId).fetch('https://event-ledger.internal/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event_id: eventId }),
  })
  if (!response.ok) throw new Error(`event_claim_${response.status}`)
  const result = (await response.json()) as { duplicate?: boolean }
  return result.duplicate !== true
}

export async function releaseEvent(binding: EventLedgerBinding, eventId: string): Promise<void> {
  const response = await ledgerStub(binding, eventId).fetch('https://event-ledger.internal/release', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event_id: eventId }),
  })
  if (!response.ok) throw new Error(`event_release_${response.status}`)
}
