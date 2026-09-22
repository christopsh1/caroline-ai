const encoder = new TextEncoder()

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function parseSignature(header: string | null): { timestamp: string; signatures: string[] } | null {
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

export async function signPayload(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  const signature = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)
  return `t=${timestamp},v1=${signature}`
}

export async function verifyPayload(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 5 * 60,
): Promise<boolean> {
  if (!secret) return false
  const parsed = parseSignature(header)
  if (!parsed) return false
  const timestamp = Number(parsed.timestamp)
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > maxAgeSeconds) return false
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`)
  return parsed.signatures.some((sig) => timingSafeEqual(sig, expected))
}
