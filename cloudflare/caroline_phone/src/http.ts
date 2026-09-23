import type { OperationalLog } from './types.ts'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
} as const

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...(headers ?? {}) },
  })
}

export function xml(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export function methodNotAllowed(allow: string): Response {
  return json({ ok: false, error: 'method_not_allowed' }, 405, { allow })
}

export function unsupportedMediaType(): Response {
  return json({ ok: false, error: 'unsupported_media_type' }, 415)
}

export function requestId(request: Request): string {
  return request.headers.get('cf-ray') ?? crypto.randomUUID()
}

export function logOperational(entry: OperationalLog): void {
  console.info(JSON.stringify({ service: 'caroline-phone', ...entry }))
}

export function safeInboundFailureTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this line is temporarily unavailable. Please try again later.</Say><Hangup/></Response>'
}

export function isJsonRequest(request: Request): boolean {
  return (request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')
}

export function isFormRequest(request: Request): boolean {
  return (request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')
}

export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aa = encoder.encode(a)
  const bb = encoder.encode(b)
  const length = Math.max(aa.length, bb.length)
  let diff = aa.length ^ bb.length
  for (let i = 0; i < length; i += 1) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}
