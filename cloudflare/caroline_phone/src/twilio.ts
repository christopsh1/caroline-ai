import { constantTimeEqual } from './http.ts'

const encoder = new TextEncoder()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function parseTwilioForm(rawBody: string): URLSearchParams {
  return new URLSearchParams(rawBody)
}

export async function expectedTwilioSignature(
  authToken: string,
  requestUrl: string,
  form: URLSearchParams,
): Promise<string> {
  const keys = [...new Set(form.keys())].sort()
  let payload = requestUrl

  for (const key of keys) {
    const values = [...new Set(form.getAll(key))].sort()
    for (const value of values) payload += `${key}${value}`
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return bytesToBase64(new Uint8Array(signature))
}

export async function verifyTwilioSignature(
  request: Request,
  rawBody: string,
  authToken: string,
): Promise<boolean> {
  const supplied = request.headers.get('x-twilio-signature') ?? ''
  if (!authToken || !supplied) return false
  const expected = await expectedTwilioSignature(authToken, request.url, parseTwilioForm(rawBody))
  return constantTimeEqual(supplied, expected)
}

export function getTwilioCallFields(form: URLSearchParams): {
  callSid: string
  from: string
  to: string
  callStatus: string
} {
  return {
    callSid: (form.get('CallSid') ?? '').trim(),
    from: (form.get('From') ?? '').trim(),
    to: (form.get('To') ?? '').trim(),
    callStatus: (form.get('CallStatus') ?? '').trim(),
  }
}

export function isE164(value: unknown): value is string {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value)
}

export function isReasonableCallSid(value: string): boolean {
  return /^CA[A-Za-z0-9]{16,64}$/.test(value)
}
