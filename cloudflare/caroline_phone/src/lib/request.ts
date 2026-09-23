export class RequestBodyTooLargeError extends Error {}

export async function readBodyWithLimit(req: Request, maxBytes: number): Promise<{ rawBody: string; bytes: number }> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyTooLargeError('declared_body_too_large')

  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.byteLength > maxBytes) throw new RequestBodyTooLargeError('body_too_large')

  return { rawBody: new TextDecoder().decode(bytes), bytes: bytes.byteLength }
}
