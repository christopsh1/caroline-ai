interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

interface R2ObjectBody {
  text(): Promise<string>
}

interface R2Bucket {
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>
  get(key: string): Promise<R2ObjectBody | null>
  delete(key: string): Promise<void>
}

interface Queue<T = unknown> {
  send(body: T): Promise<void>
}

interface Message<T = unknown> {
  body: T
  ack(): void
  retry(): void
}

interface MessageBatch<T = unknown> {
  messages: Message<T>[]
}
