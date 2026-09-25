import {
  ensureLlmSharedSecret,
  getLlmControlState,
  patchLlmControlState,
  type LlmControlBinding,
} from './llm-control'

export type CarolineLlmEnv = {
  ELEVENLABS_API_KEY?: string
  OPENROUTER_API_KEY?: string
  ELEVENLABS_INBOUND_AGENT_ID: string
  ELEVENLABS_OUTBOUND_AGENT_ID: string
  CAROLINE_PHONE_PUBLIC_URL?: string
  LLM_CONTROL: LlmControlBinding
}

type RouteConfig = {
  primary: string
  fallback: string
  temperature: number
  maxTokens: number
}

const CONFIG_VERSION = 'caroline-llm-openrouter-v1'

const ROUTES: Record<string, RouteConfig> = {
  'caroline-inbound': {
    primary: 'qwen/qwen3.8-max-0902',
    fallback: 'openai/gpt-5.6-luna',
    temperature: 0.2,
    maxTokens: 420,
  },
  'caroline-outbound': {
    primary: 'qwen/qwen3.8-flash',
    fallback: 'qwen/qwen3.8-27b',
    temperature: 0.35,
    maxTokens: 300,
  },
}

function baseUrl(env: CarolineLlmEnv): string {
  return (env.CAROLINE_PHONE_PUBLIC_URL ?? 'https://caroline-phone.customerservice-882.workers.dev').replace(/\/$/, '')
}

function elevenHeaders(env: CarolineLlmEnv): Headers {
  if (!env.ELEVENLABS_API_KEY) throw new Error('elevenlabs_api_key_missing')
  return new Headers({
    'xi-api-key': env.ELEVENLABS_API_KEY,
    'content-type': 'application/json',
    accept: 'application/json',
  })
}

async function createElevenLabsSecret(env: CarolineLlmEnv, value: string): Promise<string> {
  const response = await fetch('https://api.elevenlabs.io/v1/convai/secrets', {
    method: 'POST',
    headers: elevenHeaders(env),
    body: JSON.stringify({
      type: 'new',
      name: `CAROLINE_LLM_GATEWAY_${Date.now()}`,
      value,
    }),
  })
  const body = (await response.json().catch(() => ({}))) as { secret_id?: string; detail?: unknown }
  if (!response.ok || !body.secret_id) {
    throw new Error(`elevenlabs_secret_create_${response.status}`)
  }
  return body.secret_id
}

async function patchAgentCustomLlm(
  env: CarolineLlmEnv,
  agentId: string,
  modelId: 'caroline-inbound' | 'caroline-outbound',
  secretId: string,
): Promise<void> {
  const route = ROUTES[modelId]
  const getResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    headers: elevenHeaders(env),
  })
  if (!getResponse.ok) throw new Error(`elevenlabs_agent_get_${getResponse.status}`)
  const current = (await getResponse.json()) as any
  const currentPrompt = current?.conversation_config?.agent?.prompt ?? {}

  const patchResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: elevenHeaders(env),
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            ...currentPrompt,
            llm: 'custom-llm',
            custom_llm: {
              url: `${baseUrl(env)}/v1/chat/completions`,
              model_id: modelId,
              api_key: { secret_id: secretId },
              request_headers: {},
            },
            temperature: route.temperature,
            max_tokens: route.maxTokens,
          },
        },
      },
      version_description: `Caroline ${modelId} Cloudflare/OpenRouter production brain`,
    }),
  })
  if (!patchResponse.ok) {
    const text = await patchResponse.text().catch(() => '')
    throw new Error(`elevenlabs_agent_patch_${patchResponse.status}:${text.slice(0, 200)}`)
  }
}

export async function ensureCustomLlmConfigured(env: CarolineLlmEnv): Promise<void> {
  if (!env.ELEVENLABS_API_KEY || !env.OPENROUTER_API_KEY) return

  try {
    let state = await ensureLlmSharedSecret(env.LLM_CONTROL)
    if (!state.shared_secret) throw new Error('llm_shared_secret_missing')

    let secretId = state.elevenlabs_secret_id
    if (!secretId) {
      secretId = await createElevenLabsSecret(env, state.shared_secret)
      state = await patchLlmControlState(env.LLM_CONTROL, {
        elevenlabs_secret_id: secretId,
        last_error: '',
      })
    }

    if (state.configured_version === CONFIG_VERSION) return

    await patchAgentCustomLlm(env, env.ELEVENLABS_INBOUND_AGENT_ID, 'caroline-inbound', secretId)
    await patchAgentCustomLlm(env, env.ELEVENLABS_OUTBOUND_AGENT_ID, 'caroline-outbound', secretId)

    await patchLlmControlState(env.LLM_CONTROL, {
      configured_version: CONFIG_VERSION,
      configured_at: new Date().toISOString(),
      last_error: '',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await patchLlmControlState(env.LLM_CONTROL, { last_error: message.slice(0, 500) })
    } catch {
      // Never replace the original bootstrap failure with a state persistence failure.
    }
    throw error
  }
}

export async function customLlmStatus(env: CarolineLlmEnv) {
  const state = await getLlmControlState(env.LLM_CONTROL).catch(() => null)
  return {
    openrouter_secret_configured: Boolean(env.OPENROUTER_API_KEY),
    gateway_secret_created: Boolean(state?.shared_secret),
    elevenlabs_secret_created: Boolean(state?.elevenlabs_secret_id),
    configured_version: state?.configured_version ?? null,
    configured_at: state?.configured_at ?? null,
    last_error: state?.last_error || null,
  }
}

export async function handleCustomLlm(request: Request, env: CarolineLlmEnv): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) {
    return Response.json({ error: 'openrouter_not_configured' }, { status: 503 })
  }

  const state = await getLlmControlState(env.LLM_CONTROL)
  if (!state?.shared_secret) {
    return Response.json({ error: 'llm_gateway_not_configured' }, { status: 503 })
  }

  const authorization = request.headers.get('authorization')
  if (authorization !== `Bearer ${state.shared_secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let input: Record<string, any>
  try {
    input = (await request.json()) as Record<string, any>
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const requestedModel = typeof input.model === 'string' ? input.model : ''
  const route = ROUTES[requestedModel]
  if (!route) {
    return Response.json({ error: 'unsupported_model', model: requestedModel }, { status: 400 })
  }

  const {
    model: _ignoredModel,
    temperature: _ignoredTemperature,
    max_tokens: _ignoredMaxTokens,
    stream: _ignoredStream,
    provider: incomingProvider,
    elevenlabs_extra_body: _ignoredExtraBody,
    ...forwarded
  } = input

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'x-title': 'Caroline Voice',
      'http-referer': baseUrl(env),
    },
    body: JSON.stringify({
      ...forwarded,
      model: route.primary,
      models: [route.fallback],
      temperature: route.temperature,
      max_tokens: route.maxTokens,
      stream: true,
      provider: {
        ...(typeof incomingProvider === 'object' && incomingProvider ? incomingProvider : {}),
        sort: 'latency',
        allow_fallbacks: true,
        require_parameters: true,
      },
    }),
  })

  const headers = new Headers()
  headers.set('content-type', upstream.headers.get('content-type') ?? 'text/event-stream')
  headers.set('cache-control', 'no-store')
  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
}
