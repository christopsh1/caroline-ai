import type { Env } from '../types.ts'

const REGISTER_CALL_URL = 'https://api.elevenlabs.io/v1/convai/twilio/register-call'

export type TwilioCallDirection = 'inbound' | 'outbound'

export interface RegisterTwilioCallInput {
  callSid: string
  fromNumber: string
  toNumber: string
  direction: TwilioCallDirection
  answeredBy?: string
}

export type RegisterTwilioCallResult =
  | { ok: true; twiml: string }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'upstream_error'; status: number }
  | { ok: false; reason: 'invalid_twiml' }

export function buildRegisterCallBody(env: Env, input: RegisterTwilioCallInput): Record<string, unknown> {
  const dynamicVariables: Record<string, string> = {
    telephony_provider: 'twilio',
    call_direction: input.direction,
    twilio_call_sid: input.callSid,
  }
  if (input.answeredBy) dynamicVariables.twilio_answered_by = input.answeredBy

  return {
    agent_id: env.ELEVENLABS_AGENT_ID?.trim() ?? '',
    from_number: input.fromNumber,
    to_number: input.toNumber,
    direction: input.direction,
    conversation_initiation_client_data: {
      dynamic_variables: dynamicVariables,
    },
  }
}

export async function registerTwilioCall(
  env: Env,
  input: RegisterTwilioCallInput,
  fetcher: typeof fetch = fetch,
): Promise<RegisterTwilioCallResult> {
  const apiKey = env.ELEVENLABS_API_KEY?.trim()
  const agentId = env.ELEVENLABS_AGENT_ID?.trim()
  if (!apiKey || !agentId) return { ok: false, reason: 'not_configured' }

  let response: Response
  try {
    response = await fetcher(REGISTER_CALL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(buildRegisterCallBody(env, input)),
    })
  } catch {
    return { ok: false, reason: 'upstream_error', status: 503 }
  }

  if (!response.ok) return { ok: false, reason: 'upstream_error', status: response.status }

  const twiml = (await response.text()).trim()
  if (!twiml || !twiml.includes('<Response')) return { ok: false, reason: 'invalid_twiml' }
  return { ok: true, twiml }
}
