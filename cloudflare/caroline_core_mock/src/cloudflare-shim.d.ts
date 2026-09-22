interface R2ObjectBody { text(): Promise<string> }
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>
  delete(key: string): Promise<void>
}
