export type CallDirection = 'inbound' | 'outbound'

export interface RegisterCallInput {
  fromNumber: string
  toNumber: string
  direction: CallDirection
  outboundBriefJson?: string
}

export interface TwilioCredentials {
  accountSid: string
  authToken: string
  fromNumber: string
}

const encoder = new TextEncoder()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function safeEqual(a: string, b: string): boolean {
  const aa = encoder.encode(a)
  const bb = encoder.encode(b)
  const length = Math.max(aa.length, bb.length)
  let diff = aa.length ^ bb.length
  for (let i = 0; i < length; i += 1) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export async function expectedTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
): Promise<string> {
  const keys = [...new Set(params.keys())].sort()
  let payload = url
  for (const key of keys) {
    const values = params.getAll(key).sort()
    for (const value of values) payload += `${key}${value}`
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload))
  return bytesToBase64(new Uint8Array(signed))
}

export async function verifyTwilioFormRequest(
  request: Request,
  rawBody: string,
  authToken: string,
): Promise<boolean> {
  const supplied = request.headers.get('x-twilio-signature') ?? ''
  if (!supplied || !authToken) return false
  const expected = await expectedTwilioSignature(authToken, request.url, new URLSearchParams(rawBody))
  return safeEqual(supplied, expected)
}

export function isE164(value: unknown): value is string {
  return typeof value === 'string' && /^\+[1-9]\d{6,14}$/.test(value)
}

export function buildRegisterDynamicVariables(input: RegisterCallInput): Record<string, string> {
  return {
    caroline_context_json: '{}',
    caller_identity_status: 'unknown',
    caller_access_tier: 'tier_0_unknown_unverified',
    caller_tone_profile: 'professional',
    caller_permissions_json: '{}',
    caller_recent_history: '',
    caroline_active_instructions: '',
    availability_status: '',
    calendar_share_level: 'none',
    calendar_current_activity: 'null',
    calendar_next_event: 'null',
    outbound_call_brief_json: input.direction === 'outbound' ? (input.outboundBriefJson ?? '{}') : '{}',
    session_energy: 'neutral',
    call_answering_status: 'allowed',
    call_answering_reason: 'cloudflare_register_call',
    call_reentry_notice_pending: 'false',
  }
}

export async function registerElevenLabsCall(
  fetcher: typeof fetch,
  apiKey: string,
  agentId: string,
  input: RegisterCallInput,
): Promise<string> {
  const response = await fetcher('https://api.elevenlabs.io/v1/convai/twilio/register-call', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      agent_id: agentId,
      from_number: input.fromNumber,
      to_number: input.toNumber,
      direction: input.direction,
      conversation_initiation_client_data: {
        dynamic_variables: buildRegisterDynamicVariables(input),
      },
    }),
  })

  if (!response.ok) throw new Error('elevenlabs_register_call_failed')

  const raw = await response.text()
  let twiml = raw.trim()
  try {
    const parsed = JSON.parse(twiml) as unknown
    if (typeof parsed === 'string') twiml = parsed
    else if (parsed && typeof parsed === 'object' && 'twiml' in parsed) {
      const candidate = (parsed as { twiml?: unknown }).twiml
      if (typeof candidate === 'string') twiml = candidate
    }
  } catch {
    // A direct XML response is valid.
  }

  if (!/<Response(?:\s|>)/.test(twiml)) throw new Error('elevenlabs_invalid_twiml')
  return twiml
}

function basicAuth(accountSid: string, authToken: string): string {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`
}

export async function createTwilioOutboundCall(
  fetcher: typeof fetch,
  credentials: TwilioCredentials,
  input: {
    toNumber: string
    voiceUrl: string
    statusUrl: string
    amdUrl: string
    machineDetection: boolean
  },
): Promise<{ callSid: string; status: string | null }> {
  const form = new URLSearchParams()
  form.set('To', input.toNumber)
  form.set('From', credentials.fromNumber)
  form.set('Url', input.voiceUrl)
  form.set('Method', 'POST')
  form.set('StatusCallback', input.statusUrl)
  form.set('StatusCallbackMethod', 'POST')
  for (const event of ['initiated', 'ringing', 'answered', 'completed']) form.append('StatusCallbackEvent', event)
  if (input.machineDetection) {
    form.set('MachineDetection', 'Enable')
    form.set('AsyncAmd', 'true')
    form.set('AsyncAmdStatusCallback', input.amdUrl)
    form.set('AsyncAmdStatusCallbackMethod', 'POST')
  }

  const response = await fetcher(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/Calls.json`,
    {
      method: 'POST',
      headers: {
        authorization: basicAuth(credentials.accountSid, credentials.authToken),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  )
  if (!response.ok) throw new Error('twilio_call_create_failed')
  const data = (await response.json()) as { sid?: unknown; status?: unknown }
  if (typeof data.sid !== 'string' || !data.sid) throw new Error('twilio_call_sid_missing')
  return { callSid: data.sid, status: typeof data.status === 'string' ? data.status : null }
}

export function shouldHangupForAmd(answeredBy: string | null, enabled: string | undefined): boolean {
  return enabled === 'true' && typeof answeredBy === 'string' && answeredBy.startsWith('machine')
}

export async function completeTwilioCall(
  fetcher: typeof fetch,
  credentials: Pick<TwilioCredentials, 'accountSid' | 'authToken'>,
  callSid: string,
): Promise<void> {
  const form = new URLSearchParams({ Status: 'completed' })
  const response = await fetcher(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/Calls/${encodeURIComponent(callSid)}.json`,
    {
      method: 'POST',
      headers: {
        authorization: basicAuth(credentials.accountSid, credentials.authToken),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  )
  if (!response.ok) throw new Error('twilio_call_complete_failed')
}
