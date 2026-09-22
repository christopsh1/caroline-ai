export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const out = new Headers(headers)
  out.set('Content-Type', 'application/json; charset=utf-8')
  out.set('Cache-Control', 'no-store')
  out.set('X-Content-Type-Options', 'nosniff')
  return new Response(JSON.stringify(body), { status, headers: out })
}
