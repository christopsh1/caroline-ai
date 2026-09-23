import type { ElevenLabsOutboundResponse } from './types.ts'

const REGISTER_CALL_URL = 'https://api.elevenlabs.io/v1/convai/twilio/register-call'
const OUTBOUND_CALL_URL = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call'
const INBOUND_TIMEOUT_MS = 8_000
const OUTBOUND_TIMEOUT_MS = 12_000

export class UpstreamError extends Error {
  constructor(
    public readonly kind: 'timeout' | 'upstream_error',
    public readonly upstreamStatus?: number,
  ) {
    super(kind)
  }
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetcher(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new UpstreamError('timeout')
    throw new UpstreamError('upstream_error')
  } finally {
    clearTimeout(timer)
  }
}

function extractTwiml(raw: string): string {
  let twiml = raw.trim()
  try {
    const parsed = JSON.parse(twiml) as unknown
    if (typeof parsed === 'string') twiml = parsed.trim()
    else if (parsed && typeof parsed === 'object' && 'twiml' in parsed) {
      const candidate = (parsed as { twiml?: unknown }).twiml
      if (typeof candidate === 'string') twiml = candidate.trim()
    }
  } catch {
    // Direct XML is the normal register-call response shape.
  }

  if (!twiml || twiml.length > 128_000 || !/<Response(?:\s|>)/i.test(twiml)) {
    throw new UpstreamError('upstream_error')
  }
  return twiml
}

export async function registerInboundCallWithElevenLabs(
  fetcher: typeof fetch,
  apiKey: string,
  agentId: string,
  caller: string,
  twilioNumber: string,
): Promise<string> {
  const response = await fetchWithTimeout(
    fetcher,
    REGISTER_CALL_URL,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        agent_id: agentId,
        from_number: caller,
        to_number: twilioNumber,
        direction: 'inbound',
      }),
    },
    INBOUND_TIMEOUT_MS,
  )

  if (!response.ok) throw new UpstreamError('upstream_error', response.status)
  return extractTwiml(await response.text())
}

export function buildOutboundElevenLabsPayload(input: {
  agentId: string
  agentPhoneNumberId: string
  to: string
  firstMessage: string
}): Record<string, unknown> {
  return {
    agent_id: input.agentId,
    agent_phone_number_id: input.agentPhoneNumberId,
    to_number: input.to,
    conversation_initiation_client_data: {
      dynamic_variables: {
        first_message: input.firstMessage,
      },
    },
    call_recording_enabled: false,
  }
}

export async function createOutboundCallWithElevenLabs(
  fetcher: typeof fetch,
  apiKey: string,
  input: {
    agentId: string
    agentPhoneNumberId: string
    to: string
    firstMessage: string
  },
): Promise<ElevenLabsOutboundResponse> {
  const response = await fetchWithTimeout(
    fetcher,
    OUTBOUND_CALL_URL,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(buildOutboundElevenLabsPayload(input)),
    },
    OUTBOUND_TIMEOUT_MS,
  )

  if (!response.ok) throw new UpstreamError('upstream_error', response.status)

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new UpstreamError('upstream_error')
  }

  if (!data || typeof data !== 'object') throw new UpstreamError('upstream_error')
  const parsed = data as ElevenLabsOutboundResponse
  return {
    success: parsed.success === true,
    conversation_id: typeof parsed.conversation_id === 'string' ? parsed.conversation_id : null,
    callSid: typeof parsed.callSid === 'string' ? parsed.callSid : null,
  }
}
