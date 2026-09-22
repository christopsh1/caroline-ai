import type { Env } from '../types.ts'
import { signCarolinePayload, verifyCarolinePayloadSignature } from './security.ts'

export type CoreOperation = 'init' | 'retrieve'

export type CoreCallResult =
  | { ok: true; body: unknown; status: number }
  | {
      ok: false
      reason:
        | 'core_not_configured'
        | 'core_url_invalid'
        | 'core_unreachable'
        | 'core_rejected'
        | 'core_response_too_large'
        | 'core_response_signature_invalid'
        | 'core_response_invalid_json'
      status?: number
    }

const CORE_RESPONSE_SIGNATURE_MAX_AGE_SECONDS = 5 * 60

function endpointFor(baseUrl: string, operation: CoreOperation): URL | null {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return null
  }
  if (base.protocol !== 'https:') return null
  const path = operation === 'init' ? '/v1/init' : '/v1/retrieve'
  return new URL(path, base)
}

export async function callCoreRuntime(
  env: Env,
  operation: CoreOperation,
  input: unknown,
  requestId: string,
  maxResponseBytes: number,
): Promise<CoreCallResult> {
  if (!env.CORE_RUNTIME_URL || !env.CORE_RUNTIME_KEY) return { ok: false, reason: 'core_not_configured' }
  const url = endpointFor(env.CORE_RUNTIME_URL, operation)
  if (!url) return { ok: false, reason: 'core_url_invalid' }

  const payload = {
    schema_version: '1',
    request_id: requestId,
    environment: env.ENVIRONMENT ?? 'unknown',
    operation,
    received_at: new Date().toISOString(),
    input,
  }
  const rawBody = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signCarolinePayload(rawBody, env.CORE_RUNTIME_KEY, timestamp)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Caroline-Operation': operation,
        'X-Caroline-Request-Id': requestId,
        'X-Caroline-Signature': signature,
      },
      body: rawBody,
    })
  } catch {
    return { ok: false, reason: 'core_unreachable' }
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maxResponseBytes) return { ok: false, reason: 'core_response_too_large', status: response.status }
  const rawResponse = new TextDecoder().decode(bytes)
  if (!response.ok) return { ok: false, reason: 'core_rejected', status: response.status }

  const verified = await verifyCarolinePayloadSignature(
    rawResponse,
    response.headers.get('X-Caroline-Signature'),
    env.CORE_RUNTIME_KEY,
    Math.floor(Date.now() / 1000),
    CORE_RESPONSE_SIGNATURE_MAX_AGE_SECONDS,
  )
  if (!verified.ok) return { ok: false, reason: 'core_response_signature_invalid', status: response.status }

  try {
    return { ok: true, body: JSON.parse(rawResponse), status: response.status }
  } catch {
    return { ok: false, reason: 'core_response_invalid_json', status: response.status }
  }
}
