import { buildCallStartVariables, type CallDirection } from './canonical'

export type ElevenLabsEnv = {
  ELEVENLABS_API_KEY: string
  ELEVENLABS_AGENT_ID: string
  ELEVENLABS_BRANCH_ID?: string
}

export type RegisterCallInput = {
  call_sid: string
  direction: CallDirection
  from_number: string
  to_number: string
}

export async function registerElevenLabsCall(
  env: ElevenLabsEnv,
  input: RegisterCallInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!env.ELEVENLABS_API_KEY) throw new Error('elevenlabs_api_key_missing')
  if (!env.ELEVENLABS_AGENT_ID) throw new Error('elevenlabs_agent_id_missing')

  const dynamicVariables = await buildCallStartVariables(input)
  const initiationData: Record<string, unknown> = {
    dynamic_variables: dynamicVariables,
  }
  if (env.ELEVENLABS_BRANCH_ID) initiationData.branch_id = env.ELEVENLABS_BRANCH_ID

  const response = await fetchImpl('https://api.elevenlabs.io/v1/convai/twilio/register-call', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      agent_id: env.ELEVENLABS_AGENT_ID,
      from_number: input.from_number,
      to_number: input.to_number,
      direction: input.direction,
      conversation_initiation_client_data: initiationData,
    }),
  })

  const twiml = await response.text()
  if (!response.ok) throw new Error(`elevenlabs_register_call_${response.status}`)
  if (!twiml.trim() || !twiml.includes('<Response')) throw new Error('elevenlabs_register_call_invalid_twiml')
  return twiml
}
