import { request as httpsRequest } from 'node:https'

/** True when the URL names a loopback HTTPS listen that presents a bundled test certificate. */
export function isLoopbackListenUrl(url: string): boolean {
  const parsed = new URL(url)
  return (parsed.protocol === 'https:' || parsed.protocol === 'wss:')
    && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]')
}

/** Fetch face used by Account and Remote Access transports. */
export type LoopbackListenFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/**
 * Fetch that accepts the bundled loopback listen certificate.
 * @param origin - selected Platform environment origin.
 * @returns a Fetch implementation, or `undefined` when the origin is not loopback HTTPS.
 */
export function createLoopbackListenFetch(origin: string): LoopbackListenFetch | undefined {
  if (!isLoopbackListenUrl(origin)) return undefined
  return createInsecureHttpsFetch()
}

function createInsecureHttpsFetch(): LoopbackListenFetch {
  const fetchHttps = async (request: Request, redirects = 0): Promise<Response> => {
    const url = new URL(request.url)
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : Buffer.from(await request.arrayBuffer())
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => { headers[key] = value })
    const response = await new Promise<Response>((resolve, reject) => {
      const upstream = httpsRequest({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers,
        rejectUnauthorized: false,
      }, (incoming) => {
        const chunks: Buffer[] = []
        incoming.on('data', (chunk) => { chunks.push(chunk as Buffer) })
        incoming.on('end', () => {
          const responseHeaders = new Headers()
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (typeof value === 'string') responseHeaders.set(key, value)
            else if (Array.isArray(value)) responseHeaders.set(key, value.join(', '))
          }
          const status = incoming.statusCode ?? 502
          resolve(new Response(
            status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks),
            { status, headers: responseHeaders },
          ))
        })
      })
      upstream.on('error', reject)
      if (body !== undefined) upstream.write(body)
      upstream.end()
    })
    const location = response.headers.get('location')
    if (location === null || redirects >= 5 || ![301, 302, 303, 307, 308].includes(response.status)) {
      return response
    }
    return await fetchHttps(new Request(new URL(location, request.url), { method: 'GET' }), redirects + 1)
  }
  return (input, init) => fetchHttps(input instanceof Request ? input : new Request(input, init))
}
