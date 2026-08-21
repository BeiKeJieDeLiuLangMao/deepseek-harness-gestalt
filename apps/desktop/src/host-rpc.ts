/** Loopback Host RPC for Desktop Companion authority. */

import { randomUUID } from 'node:crypto'
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'

const RPC_TIMEOUT_MS = 15_000

/** Unary Host result after the carrier response is accepted. */
export type DesktopHostRpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }

/** Mux or host stream frame plus the ServerRequest rpcId used by `/api/respond`. */
export interface DesktopHostStreamFrame {
  rpcId: string
  payload: Record<string, unknown>
}

/** Node HTTP client for the Desktop-owned Web Host loopback API. */
export interface DesktopHostRpc {
  /**
   * Invoke one unary Host method.
   * @param method - `session.create` and the other `/api/<method>` paths.
   * @param payload - JSON payload already valid for that method.
   * @returns Host business result; carrier failures become `ok: false`.
   */
  call(method: string, payload: Record<string, unknown>): Promise<DesktopHostRpcResult>
  /**
   * Answer one pending approval or Ask User ServerRequest.
   * @param rpcId - echoed interaction rpcId.
   * @param value - Host-approved response value.
   * @returns whether the Host still considered the interaction pending.
   */
  respond(rpcId: string, value: unknown): Promise<{ accepted: boolean }>
  /**
   * Subscribe to the all-session mux stream.
   * @param onFrame - validated ServerRequest payload.
   * @returns disposer that aborts the GET.
   */
  subscribeMux(onFrame: (frame: DesktopHostStreamFrame) => void): () => void
  /**
   * Subscribe to host-level session and workspace frames.
   * @param onFrame - validated ServerRequest payload.
   * @returns disposer that aborts the GET.
   */
  subscribeHost(onFrame: (frame: DesktopHostStreamFrame) => void): () => void
}

/**
 * Build a Host RPC client that never constructs a Chromium Request or Response.
 * @param baseUrl - Web Host loopback origin printed at spawn.
 * @returns Desktop-owned Host RPC face.
 */
export function createDesktopHostRpc(baseUrl: string): DesktopHostRpc {
  const origin = new URL(baseUrl)
  return {
    async call(method, payload) {
      const rpcId = randomUUID()
      const response = await requestJson(new URL(`/api/${method}`, origin), 'POST', {
        type: 'client-request',
        rpcId,
        method,
        payload,
      })
      return parseServerResponse(response, rpcId)
    },
    async respond(rpcId, value) {
      const response = await requestJson(new URL('/api/respond', origin), 'POST', {
        type: 'client-response',
        rpcId,
        result: { ok: true, value },
      })
      if (!isRecord(response) || response.accepted !== true) return { accepted: false }
      return { accepted: true }
    },
    subscribeMux: onFrame => subscribeEventStream(new URL('/api/events.mux', origin), onFrame),
    subscribeHost: onFrame => subscribeEventStream(new URL('/api/events.host', origin), onFrame),
  }
}

function parseServerResponse(body: unknown, rpcId: string): DesktopHostRpcResult {
  if (!isRecord(body) || body.type !== 'server-response') {
    return { ok: false, error: { code: 'bad-response', message: 'Host response is not a server-response' } }
  }
  if (body.rpcId !== rpcId) {
    return { ok: false, error: { code: 'rpc-mismatch', message: 'Host rpcId does not match the request' } }
  }
  const result = body.result
  if (!isRecord(result) || typeof result.ok !== 'boolean') {
    return { ok: false, error: { code: 'bad-response', message: 'Host result is missing ok' } }
  }
  if (result.ok) return { ok: true, value: result.value }
  const error = isRecord(result.error) ? result.error : {}
  return {
    ok: false,
    error: {
      code: typeof error.code === 'string' ? error.code : 'host-error',
      message: typeof error.message === 'string' ? error.message : 'Host rejected the request',
    },
  }
}

function subscribeEventStream(
  url: URL,
  onFrame: (frame: DesktopHostStreamFrame) => void,
): () => void {
  const controller = new AbortController()
  void readEventStream(url, controller.signal, onFrame)
  return () => { controller.abort() }
}

async function readEventStream(
  url: URL,
  signal: AbortSignal,
  onFrame: (frame: DesktopHostStreamFrame) => void,
): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const upstream = startRequest(url, { method: 'GET' }, (incoming) => {
        let buffer = ''
        incoming.setEncoding('utf8')
        incoming.on('data', (chunk: string) => {
          buffer += chunk
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const block of frames) {
            const frame = parseSseFrame(block)
            if (frame !== undefined) onFrame(frame)
          }
        })
        incoming.on('end', () => { resolve() })
        incoming.on('error', reject)
      })
      upstream.on('error', reject)
      signal.addEventListener('abort', () => {
        upstream.destroy()
        resolve()
      }, { once: true })
      upstream.end()
    })
  } catch {
    // Stream loss is recovered by the next bindHost; an aborted disposer must not throw.
  }
}

function parseSseFrame(block: string): DesktopHostStreamFrame | undefined {
  const data = block.split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .join('\n')
  if (data.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(data) as unknown
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || parsed.type !== 'server-request' || typeof parsed.rpcId !== 'string') {
    return undefined
  }
  if (!isRecord(parsed.payload) || typeof parsed.payload.type !== 'string') return undefined
  return { rpcId: parsed.rpcId, payload: parsed.payload }
}

function requestJson(url: URL, method: string, body: unknown): Promise<unknown> {
  const encoded = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const upstream = startRequest(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(encoded)),
      },
      timeout: RPC_TIMEOUT_MS,
    }, (incoming) => {
      const chunks: Buffer[] = []
      incoming.on('data', (chunk) => { chunks.push(chunk as Buffer) })
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (text.length === 0) {
          resolve({})
          return
        }
        try {
          resolve(JSON.parse(text) as unknown)
        } catch (error) {
          reject(error)
        }
      })
    })
    upstream.on('timeout', () => {
      upstream.destroy()
      reject(new Error('Host RPC timed out'))
    })
    upstream.on('error', reject)
    upstream.write(encoded)
    upstream.end()
  })
}

function startRequest(
  url: URL,
  options: RequestOptions,
  onResponse: (incoming: IncomingMessage) => void,
) {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  return request({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: `${url.pathname}${url.search}`,
    ...options,
  }, onResponse)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
