import { buildCallStartVariables, type CallDirection } from './canonical'

export type ElevenLabsEnv = {
  ELEVENLABS_API_KEY: string
  ELEVENLABS_INBOUND_AGENT_ID: string
  ELEVENLABS_OUTBOUND_AGENT_ID: string
}

export type RegisterCallInput = {
  call_sid: string
  call_context_id: string
  direction: CallDirection
  from_number: string
  to_number: string
}

export function runtimeForDirection(env: ElevenLabsEnv, direction: CallDirection) {
  if (direction === 'outbound') {
    if (!env.ELEVENLABS_OUTBOUND_AGENT_ID) throw new Error('elevenlabs_outbound_agent_id_missing')
    return { agentId: env.ELEVENLABS_OUTBOUND_AGENT_ID }
  }

  if (!env.ELEVENLABS_INBOUND_AGENT_ID) throw new Error('elevenlabs_inbound_agent_id_missing')
  return { agentId: env.ELEVENLABS_INBOUND_AGENT_ID }
}

export async function registerElevenLabsCall(
  env: ElevenLabsEnv,
  input: RegisterCallInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!env.ELEVENLABS_API_KEY) throw new Error('elevenlabs_api_key_missing')

  const runtime = runtimeForDirection(env, input.direction)
  const response = await fetchImpl('https://api.elevenlabs.io/v1/convai/twilio/register-call', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      agent_id: runtime.agentId,
      from_number: input.from_number,
      to_number: input.to_number,
      direction: input.direction,
      conversation_initiation_client_data: {
        dynamic_variables: buildCallStartVariables(input.call_context_id),
      },
    }),
  })

  const twiml = await response.text()
  if (!response.ok) throw new Error(`elevenlabs_register_call_${response.status}`)
  if (!twiml.trim() || !twiml.includes('<Response')) throw new Error('elevenlabs_register_call_invalid_twiml')
  return twiml
}
