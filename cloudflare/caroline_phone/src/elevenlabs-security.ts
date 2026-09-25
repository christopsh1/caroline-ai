const encoder = new TextEncoder()

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyElevenLabsWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 30 * 60,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false

  const values = new Map<string, string>()
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.trim().split('=', 2)
    if (key && value) values.set(key, value)
  }

  const timestamp = values.get('t')
  const supplied = values.get('v0')
  if (!timestamp || !supplied) return false

  const timestampNumber = Number(timestamp)
  if (!Number.isFinite(timestampNumber)) return false
  if (Math.abs(nowSeconds - timestampNumber) > toleranceSeconds) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`)),
  )
  return constantTimeEqualHex(hex(signed), supplied.toLowerCase())
}
