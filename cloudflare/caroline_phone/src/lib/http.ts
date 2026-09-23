const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

export function json(body: unknown, status = 200, requestId?: string): Response {
  const headers = new Headers(BASE_HEADERS)
  if (requestId) headers.set('X-Request-Id', requestId)
  return new Response(JSON.stringify(body), { status, headers })
}

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Request-Id', requestId)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export function requestIdFor(req: Request): string {
  const ray = req.headers.get('CF-Ray')?.split('-')[0]?.trim()
  return ray ? `cf-${ray}` : crypto.randomUUID()
}
