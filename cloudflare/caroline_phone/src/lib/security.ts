const encoder = new TextEncoder()
export const MAX_ELEVENLABS_SIGNATURE_AGE_SECONDS = 30 * 60

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function verifyRuntimeKey(req: Request, expected: string | undefined): boolean {
  if (!expected) return false
  return timingSafeEqual(req.headers.get('x-caroline-key') ?? '', expected)
}

function parseElevenLabsSignature(header: string | null): { timestamp: string; signatures: string[] } | null {
  if (!header) return null
  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, ...rest] = part.trim().split('=')
    const value = rest.join('=')
    if (key === 't') timestamp = value
    if (key === 'v0' && value) signatures.push(value.toLowerCase())
  }
  return timestamp && signatures.length ? { timestamp, signatures } : null
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyElevenLabsSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ ok: boolean; reason?: string }> {
  if (!secret) return { ok: false, reason: 'webhook_secret_not_configured' }
  const parsed = parseElevenLabsSignature(header)
  if (!parsed) return { ok: false, reason: 'signature_missing_or_malformed' }
  const timestamp = Number(parsed.timestamp)
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid_signature_timestamp' }
  if (Math.abs(nowSeconds - timestamp) > MAX_ELEVENLABS_SIGNATURE_AGE_SECONDS) return { ok: false, reason: 'stale_signature' }
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`)
  return parsed.signatures.some((sig) => timingSafeEqual(expected, sig))
    ? { ok: true }
    : { ok: false, reason: 'invalid_signature' }
}

function parseCarolineSignature(header: string | null): { timestamp: string; signatures: string[] } | null {
  if (!header) return null
  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, ...rest] = part.trim().split('=')
    const value = rest.join('=')
    if (key === 't') timestamp = value
    if (key === 'v1' && value) signatures.push(value.toLowerCase())
  }
  return timestamp && signatures.length ? { timestamp, signatures } : null
}

export async function verifyCarolinePayloadSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 5 * 60,
): Promise<{ ok: boolean; reason?: string }> {
  if (!secret) return { ok: false, reason: 'signature_secret_not_configured' }
  const parsed = parseCarolineSignature(header)
  if (!parsed) return { ok: false, reason: 'signature_missing_or_malformed' }
  const timestamp = Number(parsed.timestamp)
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid_signature_timestamp' }
  if (Math.abs(nowSeconds - timestamp) > maxAgeSeconds) return { ok: false, reason: 'stale_signature' }
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`)
  return parsed.signatures.some((sig) => timingSafeEqual(expected, sig))
    ? { ok: true }
    : { ok: false, reason: 'invalid_signature' }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function signCarolinePayload(rawBody: string, secret: string, timestamp: number): Promise<string> {
  const signature = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)
  return `t=${timestamp},v1=${signature}`
}
