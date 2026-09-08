/** Loopback OpenAI-compatible model double for the Desktop critical-path acceptance lane. */

import { createServer } from 'node:http'

export type CriticalPathPhase = 'create' | 'restore' | 'archive'

/** Default route exercised by the main Session. */
export const PARENT_MODEL = 'deepseek-v4-flash'
/** Dedicated supported route that distinguishes automatic title generation. */
export const TITLE_MODEL = 'deepseek-v4-pro'
/** Live-configured route exercised by the Side Chat. */
export const SIDE_MODEL = 'side-model-b'
/** Content returned for the main Session's request. */
export const PARENT_RESPONSE = 'parent-model-a response'
/** Content returned for automatic title generation. */
export const TITLE_RESPONSE = 'Critical path parent'
/** Content returned for Side Chat requests after provider B is selected. */
export const SIDE_RESPONSE = 'side-model-b response'

/** Content-free request evidence retained by the model listener. */
export interface ModelAuditEntry {
  readonly phase: CriticalPathPhase
  readonly path: string
  readonly model: string
}

/** Running keyless model listener and its bounded audit. */
export interface KeylessModelProvider {
  readonly origin: string
  readonly audit: readonly ModelAuditEntry[]
  beginPhase(phase: CriticalPathPhase): void
  close(): Promise<void>
}

/**
 * Start the only external-service substitute in the critical-path lane.
 * Request bodies are parsed only long enough to choose a deterministic reply;
 * the retained audit contains no prompt, system text, tools, or credentials.
 * @returns the running listener.
 */
export async function startKeylessModelProvider(): Promise<KeylessModelProvider> {
  const audit: ModelAuditEntry[] = []
  let phase: CriticalPathPhase = 'create'
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      if (request.method !== 'POST' || !path.endsWith('/chat/completions')) {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end('{"error":{"message":"not found"}}')
        return
      }
      let body: { model?: unknown }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { model?: unknown }
      } catch {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end('{"error":{"message":"invalid JSON"}}')
        return
      }
      if (typeof body.model !== 'string' || body.model.length === 0) {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end('{"error":{"message":"model is required"}}')
        return
      }
      audit.push({ phase, path, model: body.model })
      const content = body.model === SIDE_MODEL
        ? SIDE_RESPONSE
        : body.model === TITLE_MODEL
          ? TITLE_RESPONSE
          : PARENT_RESPONSE
      response.writeHead(200, {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream; charset=utf-8',
      })
      response.end([
        `data: ${JSON.stringify({
          choices: [{ delta: { role: 'assistant', content: '' }, index: 0, finish_reason: null }],
        })}`,
        `data: ${JSON.stringify({
          choices: [{ delta: { content }, index: 0, finish_reason: null }],
        })}`,
        `data: ${JSON.stringify({
          choices: [{ delta: {}, index: 0, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })}`,
        'data: [DONE]',
        '',
      ].join('\n\n'))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('critical-path model listener exposed no TCP address')
  }
  let closing: Promise<void> | undefined
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    audit,
    beginPhase: (next) => { phase = next },
    close: () => (closing ??= new Promise<void>((resolve, reject) => {
      server.closeAllConnections()
      server.close((error) => { if (error === undefined) resolve(); else reject(error) })
    })),
  }
}
