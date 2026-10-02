export const PRODUCTION_EMBEDDING = {
  provider: 'openai',
  model: 'text-embedding-3-small',
  version: 'openai:text-embedding-3-small:1536:v1',
  dimensions: 1536,
  queryInputType: 'search_query',
  documentInputType: 'search_document',
} as const

export type EmbeddingEnv = {
  OPENAI_API_KEY?: string
}

type OpenAIEmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>
}

export async function embedSearchQuery(env: EmbeddingEnv, input: string): Promise<number[]> {
  if (!env.OPENAI_API_KEY) throw new Error('openai_embedding_key_missing')
  const text = input.trim()
  if (!text) throw new Error('embedding_input_required')

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: PRODUCTION_EMBEDDING.model,
      input: text,
      dimensions: PRODUCTION_EMBEDDING.dimensions,
      encoding_format: 'float',
    }),
  })

  if (!response.ok) throw new Error(`embedding_provider_${response.status}`)
  const body = (await response.json()) as OpenAIEmbeddingResponse
  const embedding = body.data?.[0]?.embedding
  if (!embedding || embedding.length !== PRODUCTION_EMBEDDING.dimensions) {
    throw new Error('embedding_provider_invalid_response')
  }
  return embedding
}
