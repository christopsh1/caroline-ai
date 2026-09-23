const encoder = new TextEncoder()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

function normalizedParams(input: URLSearchParams | Record<string, string | string[]>): URLSearchParams {
  if (input instanceof URLSearchParams) return input
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else {
      params.append(key, value)
    }
  }
  return params
}

export async function expectedTwilioSignature(
  authToken: string,
  publicUrl: string,
  input: URLSearchParams | Record<string, string | string[]>,
): Promise<string> {
  const params = normalizedParams(input)
  const keys = Array.from(new Set(params.keys())).sort()
  let payload = publicUrl

  for (const key of keys) {
    const values = params.getAll(key).sort()
    for (const value of values) payload += `${key}${value}`
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
  return bytesToBase64(signed)
}

export async function verifyTwilioFormRequest(
  request: Request,
  rawBody: string,
  authToken: string,
): Promise<boolean> {
  const supplied = request.headers.get('x-twilio-signature')
  if (!supplied || !authToken) return false

  try {
    const expected = await expectedTwilioSignature(authToken, request.url, new URLSearchParams(rawBody))
    return constantTimeEqual(base64ToBytes(supplied), base64ToBytes(expected))
  } catch {
    return false
  }
}
