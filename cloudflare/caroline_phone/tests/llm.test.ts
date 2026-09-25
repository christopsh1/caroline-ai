import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureCustomLlmConfigured, handleCustomLlm } from '../src/llm'
import type { LlmControlBinding, LlmControlState } from '../src/llm-control'

function makeLlmControl(initial: LlmControlState | null = null) {
  let state: LlmControlState | null = initial
  const binding: LlmControlBinding = {
    idFromName(name: string) {
      return name
    },
    get() {
      return {
        async fetch(input: RequestInfo | URL, init?: RequestInit) {
          const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
          if (url.pathname === '/state' && (!init?.method || init.method === 'GET')) {
            return Response.json(state)
          }
          if (url.pathname === '/ensure-secret' && init?.method === 'POST') {
            if (!state?.shared_secret) {
              state = {
                ...(state ?? {}),
                shared_secret: 'gateway-secret',
                updated_at: new Date().toISOString(),
              }
            }
            return Response.json(state)
          }
          if (url.pathname === '/state' && init?.method === 'PATCH') {
            const patch = JSON.parse(String(init.body ?? '{}'))
            state = {
              ...(state ?? {}),
              ...patch,
              updated_at: new Date().toISOString(),
            }
            return Response.json(state)
          }
          return new Response('not_found', { status: 404 })
        },
      }
    },
  }
  return { binding, getState: () => state }
}

function proxyEnv(binding: LlmControlBinding) {
  return {
    ELEVENLABS_API_KEY: 'eleven-test-key',
    OPENROUTER_API_KEY: 'openrouter-test-key',
    ELEVENLABS_INBOUND_AGENT_ID: 'agent_inbound',
    ELEVENLABS_OUTBOUND_AGENT_ID: 'agent_outbound',
    CAROLINE_PHONE_PUBLIC_URL: 'https://phone.example',
    LLM_CONTROL: binding,
  }
}

test('custom LLM endpoint rejects requests without the ElevenLabs gateway bearer secret', async () => {
  const control = makeLlmControl({ shared_secret: 'gateway-secret', updated_at: new Date().toISOString() })
  const request = new Request('https://phone.example/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'caroline-inbound', messages: [] }),
  })

  const response = await handleCustomLlm(request, proxyEnv(control.binding))
  assert.equal(response.status, 401)
})

test('custom LLM rewrites inbound routing to the fixed OpenRouter primary and fallback', async () => {
  const control = makeLlmControl({ shared_secret: 'gateway-secret', updated_at: new Date().toISOString() })
  const previousFetch = globalThis.fetch
  let upstreamBody: any = null
  let upstreamHeaders: Headers | null = null

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    upstreamBody = JSON.parse(String(init?.body ?? '{}'))
    upstreamHeaders = new Headers(init?.headers)
    return new Response('data: {"choices":[]}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }) as typeof fetch

  try {
    const request = new Request('https://phone.example/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer gateway-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'caroline-inbound',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [{ type: 'function', function: { name: 'noop', parameters: {} } }],
        temperature: 0.99,
        max_tokens: 9999,
      }),
    })

    const response = await handleCustomLlm(request, proxyEnv(control.binding))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/event-stream')
    assert.equal(upstreamBody.model, 'qwen/qwen3.8-max-0902')
    assert.deepEqual(upstreamBody.models, ['openai/gpt-5.6-luna'])
    assert.equal(upstreamBody.temperature, 0.2)
    assert.equal(upstreamBody.max_tokens, 420)
    assert.equal(upstreamBody.stream, true)
    assert.equal(upstreamBody.provider.sort, 'latency')
    assert.equal(upstreamBody.provider.allow_fallbacks, true)
    assert.equal(upstreamBody.provider.require_parameters, true)
    assert.equal(upstreamBody.tools[0].function.name, 'noop')
    assert.equal(upstreamHeaders?.get('authorization'), 'Bearer openrouter-test-key')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('custom LLM rewrites outbound routing to the low-latency OpenRouter path', async () => {
  const control = makeLlmControl({ shared_secret: 'gateway-secret', updated_at: new Date().toISOString() })
  const previousFetch = globalThis.fetch
  let upstreamBody: any = null

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    upstreamBody = JSON.parse(String(init?.body ?? '{}'))
    return new Response('data: {"choices":[]}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }) as typeof fetch

  try {
    const request = new Request('https://phone.example/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer gateway-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'caroline-outbound', messages: [] }),
    })

    const response = await handleCustomLlm(request, proxyEnv(control.binding))
    assert.equal(response.status, 200)
    assert.equal(upstreamBody.model, 'qwen/qwen3.8-flash')
    assert.deepEqual(upstreamBody.models, ['qwen/qwen3.8-27b'])
    assert.equal(upstreamBody.temperature, 0.35)
    assert.equal(upstreamBody.max_tokens, 300)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('bootstrap creates an ElevenLabs gateway secret and patches both agents to the Cloudflare custom LLM', async () => {
  const control = makeLlmControl(null)
  const previousFetch = globalThis.fetch
  const calls: Array<{ url: string; method: string; body?: any }> = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })

    if (url.endsWith('/v1/convai/secrets') && method === 'POST') {
      assert.equal(body.type, 'new')
      assert.equal(body.value, 'gateway-secret')
      return Response.json({ secret_id: 'secret_gateway' })
    }

    if (url.includes('/v1/convai/agents/') && method === 'GET') {
      return Response.json({
        conversation_config: {
          agent: {
            prompt: {
              prompt: 'existing prompt',
              llm: 'gpt-5.6-terra',
              tool_ids: [],
            },
          },
        },
      })
    }

    if (url.includes('/v1/convai/agents/') && method === 'PATCH') {
      return Response.json({ ok: true })
    }

    throw new Error(`unexpected fetch ${method} ${url}`)
  }) as typeof fetch

  try {
    await ensureCustomLlmConfigured(proxyEnv(control.binding))
  } finally {
    globalThis.fetch = previousFetch
  }

  const secretCall = calls.find((call) => call.url.endsWith('/v1/convai/secrets'))
  assert.ok(secretCall)

  const patches = calls.filter((call) => call.method === 'PATCH' && call.url.includes('/v1/convai/agents/'))
  assert.equal(patches.length, 2)

  const inbound = patches.find((call) => call.url.endsWith('/agent_inbound'))
  const outbound = patches.find((call) => call.url.endsWith('/agent_outbound'))
  assert.ok(inbound)
  assert.ok(outbound)

  assert.equal(inbound.body.conversation_config.agent.prompt.prompt, 'existing prompt')
  assert.equal(inbound.body.conversation_config.agent.prompt.llm, 'custom-llm')
  assert.equal(inbound.body.conversation_config.agent.prompt.custom_llm.url, 'https://phone.example/v1/chat/completions')
  assert.equal(inbound.body.conversation_config.agent.prompt.custom_llm.model_id, 'caroline-inbound')
  assert.equal(inbound.body.conversation_config.agent.prompt.custom_llm.api_key.secret_id, 'secret_gateway')
  assert.equal(inbound.body.conversation_config.agent.prompt.temperature, 0.2)
  assert.equal(inbound.body.conversation_config.agent.prompt.max_tokens, 420)

  assert.equal(outbound.body.conversation_config.agent.prompt.custom_llm.model_id, 'caroline-outbound')
  assert.equal(outbound.body.conversation_config.agent.prompt.temperature, 0.35)
  assert.equal(outbound.body.conversation_config.agent.prompt.max_tokens, 300)

  const state = control.getState()
  assert.equal(state?.elevenlabs_secret_id, 'secret_gateway')
  assert.equal(state?.configured_version, 'caroline-llm-openrouter-v1')
  assert.ok(state?.configured_at)
}
