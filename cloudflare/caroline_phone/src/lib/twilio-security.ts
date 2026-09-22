const encoder = new TextEncoder()

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  return bytesToBase64(bytes)
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

function rawPathAndQuery(url: string): string {
  const scheme = url.indexOf('://')
  if (scheme < 0) return '/'
  const path = url.indexOf('/', scheme + 3)
  return path < 0 ? '/' : url.slice(path)
}

export function twilioPublicUrl(req: Request, publicBaseUrl: string | undefined): string | null {
  if (!publicBaseUrl) return null
  const base = publicBaseUrl.replace(/\/+$/, '')
  if (!base.startsWith('https://') || /[?#]/.test(base.slice('https://'.length))) return null
  return `${base}${rawPathAndQuery(req.url)}`
}

function formParams(rawBody: string): Record<string, string | string[]> {
  const values = new Map<string, string[]>()
  new URLSearchParams(rawBody).forEach((value, key) => {
    const existing = values.get(key) ?? []
    existing.push(value)
    values.set(key, existing)
  })
  return Object.fromEntries([...values].map(([key, raw]) => {
    const unique = [...new Set(raw)].sort()
    return [key, unique.length === 1 ? unique[0] : unique]
  }))
}

function appendTwilioParams(url: string, params: Record<string, string | string[]>): string {
  return Object.keys(params).sort().reduce((out, key) => {
    const value = params[key]
    if (Array.isArray(value)) return out + value.map((v) => `${key}${v}`).join('')
    return out + key + value
  }, url)
}

export async function expectedTwilioSignature(
  authToken: string,
  publicUrl: string,
  params: Record<string, string | string[]> = {},
): Promise<string> {
  return hmacSha1Base64(authToken, appendTwilioParams(publicUrl, params))
}

export async function verifyTwilioRequest(
  req: Request,
  rawBody: string,
  authToken: string | undefined,
  publicBaseUrl: string | undefined,
): Promise<{ ok: boolean; reason?: string; public_url?: string }> {
  if (!authToken) return { ok: false, reason: 'twilio_auth_token_not_configured' }
  const publicUrl = twilioPublicUrl(req, publicBaseUrl)
  if (!publicUrl) return { ok: false, reason: 'twilio_public_base_url_not_configured' }
  const supplied = req.headers.get('X-Twilio-Signature') ?? ''
  if (!supplied) return { ok: false, reason: 'twilio_signature_missing', public_url: publicUrl }

  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
  let expected: string

  if (contentType.includes('application/json')) {
    const queryIndex = publicUrl.indexOf('?')
    const bodyHash = queryIndex >= 0 ? new URLSearchParams(publicUrl.slice(queryIndex + 1)).get('bodySHA256') : null
    if (!bodyHash) return { ok: false, reason: 'twilio_body_sha256_missing', public_url: publicUrl }
    const actualBodyHash = await sha256Hex(rawBody)
    if (!timingSafeEqual(actualBodyHash, bodyHash.toLowerCase())) {
      return { ok: false, reason: 'twilio_body_sha256_invalid', public_url: publicUrl }
    }
    expected = await expectedTwilioSignature(authToken, publicUrl)
  } else if (req.method === 'POST' && contentType.includes('application/x-www-form-urlencoded')) {
    expected = await expectedTwilioSignature(authToken, publicUrl, formParams(rawBody))
  } else if (req.method === 'GET') {
    expected = await expectedTwilioSignature(authToken, publicUrl)
  } else {
    return { ok: false, reason: 'twilio_content_type_unsupported', public_url: publicUrl }
  }

  return timingSafeEqual(expected, supplied)
    ? { ok: true, public_url: publicUrl }
    : { ok: false, reason: 'twilio_signature_invalid', public_url: publicUrl }
}
