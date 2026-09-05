/** Typed loopback RPC from Desktop Host to its bundled Web Host. */

import { randomUUID } from 'node:crypto'
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'
import WebSocket from 'ws'
import {
  REMOTE_PROTOCOL_LIMITS,
  type CompanionHostFailure,
} from '@deepseek-ai/dsh-remote-protocol'

const REMOTE_STREAM_MUX_PATH = '/api/remote.mux'

const DEFAULT_HOST_RPC_TIMEOUT_MS = 15_000
const MAX_HOST_ATTACHMENT_RESPONSE_BYTES = Math.ceil(
  REMOTE_PROTOCOL_LIMITS.imageChunkBytes * REMOTE_PROTOCOL_LIMITS.imageChunks / 3,
) * 4 + REMOTE_PROTOCOL_LIMITS.companionMessageBytes
const MAX_HOST_PROJECTED_RESPONSE_BYTES = REMOTE_PROTOCOL_LIMITS.transcriptPageBytes
  * REMOTE_PROTOCOL_LIMITS.transcriptPageEntries

/** Unary Host call result after HTTP, JSON, envelope, and business validation. */
export type DesktopHostRpcResult =
  | { ok: true; value: unknown }
  | { ok: false; failure: CompanionHostFailure }

/** Node HTTP client for the Desktop-owned Web Host loopback API. */
export interface DesktopHostRpc {
  /**
   * Invoke one unary Host method without throwing Host HTTP, wire, business, or timeout failures.
   * @param method - Host RPC method and `/api/<method>` path.
   * @param payload - JSON payload for the method.
   * @returns validated value or a stable failure for Companion projection.
   */
  call(
    method: string,
    payload: Record<string, unknown>,
    options?: { timeoutMs?: number; rpcId?: string; signal?: AbortSignal },
  ): Promise<DesktopHostRpcResult>
  /**
   * Settle one Host-originated Approval or Ask User request by its private rpc identity.
   * @param rpcId - exact id received from the current Host event stream.
   * @param result - domain result shell accepted by `/api/respond`.
   * @returns Host carrier receipt.
   */
  respond?(
    rpcId: string,
    result: Record<string, unknown>,
  ): Promise<{ accepted: true } | { accepted: false; reason: 'not-pending' | 'bad-response' }>
  /** Follow Host Session and interaction frames for the current Web Host generation. */
  watchMux?(
    signal: AbortSignal,
    accept: (envelope: { rpcId: string; payload: unknown }) => void,
  ): Promise<void>
  /** Follow Host list/status frames for the current Web Host generation. */
  watchHost?(
    signal: AbortSignal,
    accept: (envelope: { rpcId: string; payload: unknown }) => void,
  ): Promise<void>
  /**
   * Follow generated Gateway `session/follow` on `/api/remote.mux`.
   * Cookie is sent only to the bootstrap origin. Abort sends mux `cancel`.
   */
  followSession?(
    sessionId: string,
    signal: AbortSignal,
    accept: (frame: unknown) => void,
  ): Promise<void>
  /**
   * Follow generated Gateway `workspace/follow` on `/api/remote.mux`.
   * Cookie is sent only to the bootstrap origin. Abort sends mux `cancel`.
   */
  followWorkspaces?(
    signal: AbortSignal,
    accept: (frame: unknown) => void,
  ): Promise<void>
}

/** Desktop Host RPC construction options. */
export interface DesktopHostRpcOptions {
  /** Wall-clock deadline for one unary Host request. */
  timeoutMs?: number
  /** Maximum accumulated response bytes for ordinary unary calls; cannot exceed the Companion message ceiling. */
  responseMaxBytes: number
  /** Wall-clock deadline for one maximum-size local attachment admission. */
  attachmentTimeoutMs?: number
  /** In-memory Host session cookie from {@link bootstrapDesktopHostCookie}; never logged or persisted. */
  cookieHeader?: string
}

/**
 * Build the Desktop-owned loopback Host RPC client.
 * @param baseUrl - public Web Host loopback origin.
 * @param options - request deadline.
 * @returns typed unary client.
 */
export function createDesktopHostRpc(baseUrl: string, options: DesktopHostRpcOptions): DesktopHostRpc {
  const origin = new URL(baseUrl)
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') {
    throw new TypeError('Desktop Host RPC baseUrl must be a loopback http origin')
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_HOST_RPC_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('Desktop Host RPC timeoutMs must be a positive safe integer')
  }
  const responseMaxBytes = options.responseMaxBytes
  if (options.attachmentTimeoutMs !== undefined
    && (!Number.isSafeInteger(options.attachmentTimeoutMs) || options.attachmentTimeoutMs <= 0)) {
    throw new TypeError('Desktop Host RPC attachmentTimeoutMs must be a positive safe integer')
  }
  if (!Number.isSafeInteger(responseMaxBytes) || responseMaxBytes <= 0
    || responseMaxBytes > REMOTE_PROTOCOL_LIMITS.companionMessageBytes) {
    throw new TypeError('Desktop Host RPC responseMaxBytes must be a positive safe integer within the Companion message ceiling')
  }
  return {
    async call(method, payload, callOptions) {
      const attachmentRead = method === 'session.attachment'
      const projectedRead = method === 'session.history'
        || method === 'session.list'
        || method === 'session/list'
        || method === 'workspace.list'
      const callTimeoutMs = callOptions?.timeoutMs
        ?? (attachmentRead ? options.attachmentTimeoutMs : undefined)
        ?? timeoutMs
      if (!Number.isSafeInteger(callTimeoutMs) || callTimeoutMs <= 0) {
        throw new TypeError('Desktop Host RPC call timeoutMs must be a positive safe integer')
      }
      const rpcId = callOptions?.rpcId ?? randomUUID()
      const response = await requestJson(
        new URL(`/api/${method}`, origin),
        { type: 'client-request', rpcId, method, payload },
        callTimeoutMs,
        attachmentRead
          ? MAX_HOST_ATTACHMENT_RESPONSE_BYTES
          : projectedRead ? MAX_HOST_PROJECTED_RESPONSE_BYTES : responseMaxBytes,
        callOptions?.signal,
        options.cookieHeader,
      )
      if (response.kind === 'timeout') {
        return { ok: false, failure: { kind: 'timeout', code: 'HOST_TIMEOUT', message: 'Desktop Host request timed out' } }
      }
      if (response.kind === 'transport') {
        return { ok: false, failure: { kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host response transport failed' } }
      }
      if (response.kind === 'limit') {
        return { ok: false, failure: { kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host response exceeded its byte limit' } }
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          failure: {
            kind: 'http',
            code: 'HOST_HTTP_STATUS',
            message: `Desktop Host returned HTTP ${String(response.status)}`,
            status: response.status,
          },
        }
      }
      let body: unknown
      try {
        body = JSON.parse(response.text) as unknown
      } catch {
        return {
          ok: false,
          failure: { kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host response was not valid RPC JSON' },
        }
      }
      return parseServerResponse(body, rpcId)
    },
    async respond(rpcId, result) {
      const response = await requestJson(
        new URL('/api/respond', origin),
        { type: 'client-response', rpcId, result },
        timeoutMs,
        responseMaxBytes,
        undefined,
        options.cookieHeader,
      )
      if (response.kind !== 'response' || response.status < 200 || response.status >= 300) {
        throw new Error('Desktop Host interaction response transport failed')
      }
      const value: unknown = JSON.parse(response.text)
      if (!isRecord(value) || typeof value.accepted !== 'boolean') {
        throw new Error('Desktop Host interaction receipt was invalid')
      }
      if (value.accepted && Object.keys(value).length === 1) return { accepted: true }
      if (!value.accepted && Object.keys(value).length === 2
        && (value.reason === 'not-pending' || value.reason === 'bad-response')) {
        return { accepted: false, reason: value.reason }
      }
      throw new Error('Desktop Host interaction receipt was invalid')
    },
    watchMux: async (signal, accept) => {
      await watchHostWebSocket(origin, '/api/events.mux', signal, accept, options.cookieHeader)
    },
    watchHost: async (signal, accept) => {
      await watchHostWebSocket(origin, '/api/events.host', signal, accept, options.cookieHeader)
    },
    followSession: async (sessionId, signal, accept) => {
      await followRemoteMux(
        origin,
        'session/follow',
        { args: { request: { address: { kind: 'session', sessionId } } } },
        signal,
        accept,
        options.cookieHeader,
      )
    },
    followWorkspaces: async (signal, accept) => {
      await followRemoteMux(origin, 'workspace/follow', { args: {} }, signal, accept, options.cookieHeader)
    },
  }
}

function watchHostWebSocket(
  origin: URL,
  path: string,
  signal: AbortSignal,
  accept: (envelope: { rpcId: string; payload: unknown }) => void,
  cookieHeader?: string,
): Promise<void> {
  const url = new URL(path, origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return new Promise((resolve, reject) => {
    const socket = openOriginWebSocket(url, origin, cookieHeader)
    const settled = { value: false }
    const cleanup = (): void => {
      signal.removeEventListener('abort', abort)
      socket.removeAllListeners()
    }
    const settle = (failure?: Error): void => {
      settleSocket(settled, cleanup, resolve, reject, failure)
    }
    const abort = (): void => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
      settle()
    }
    const message = (data: WebSocket.RawData): void => {
      try {
        const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8')
        if (Buffer.byteLength(text) > MAX_HOST_PROJECTED_RESPONSE_BYTES) {
          throw new Error('Desktop Host event stream frame exceeded its byte ceiling')
        }
        const envelope: unknown = JSON.parse(text)
        if (!isRecord(envelope) || envelope.type !== 'server-request'
          || typeof envelope.rpcId !== 'string' || !('payload' in envelope)) {
          throw new Error('Desktop Host event stream envelope was invalid')
        }
        accept({ rpcId: envelope.rpcId, payload: envelope.payload })
      } catch (cause) {
        socket.close()
        settle(new Error('Desktop Host event stream returned an invalid frame', { cause }))
      }
    }
    socket.on('message', message)
    socket.once('close', () => {
      settle(signal.aborted || settled.value ? undefined : new Error('Desktop Host event stream closed'))
    })
    socket.once('error', () => { settle(new Error('Desktop Host event stream failed')) })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

function parseServerResponse(body: unknown, rpcId: string): DesktopHostRpcResult {
  if (!isRecord(body) || body.type !== 'server-response' || body.rpcId !== rpcId || !isRecord(body.result)) {
    return {
      ok: false,
      failure: { kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host response did not match the RPC request' },
    }
  }
  const result = body.result
  if (result.ok === true) return { ok: true, value: result.value }
  if (result.ok !== false || !isRecord(result.error)) {
    return {
      ok: false,
      failure: { kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host response did not contain an RPC result' },
    }
  }
  const code = typeof result.error.code === 'string' && result.error.code !== ''
    ? result.error.code
    : 'host-error'
  const message = typeof result.error.message === 'string' && result.error.message !== ''
    ? result.error.message
    : 'Desktop Host rejected the request'
  return { ok: false, failure: { kind: 'business', code, message } }
}

type RequestOutcome =
  | { kind: 'response'; status: number; text: string; headers?: IncomingMessage['headers'] }
  | { kind: 'timeout' }
  | { kind: 'transport' }
  | { kind: 'limit' }

/**
 * Exchange the process launch token at the loopback root for an in-memory Host cookie.
 * @param launchUrl - authenticated `GET /?token=` URL printed by `dsh web`.
 * @param origin - public loopback origin; redirects off this origin fail.
 * @param timeoutMs - wall-clock deadline for the exchange.
 * @returns the `Cookie` request header value. Never persisted.
 */
export async function bootstrapDesktopHostCookie(
  launchUrl: string,
  origin: string,
  timeoutMs = DEFAULT_HOST_RPC_TIMEOUT_MS,
): Promise<string> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('Desktop Host cookie bootstrap timeoutMs must be a positive safe integer')
  }
  const launch = new URL(launchUrl)
  const expected = new URL(origin)
  if (launch.origin !== expected.origin
    || expected.protocol !== 'http:'
    || expected.hostname !== '127.0.0.1'
    || launch.pathname !== '/'
    || launch.searchParams.getAll('token').length !== 1) {
    throw new TypeError('Desktop Host cookie bootstrap requires the same-origin loopback launch URL')
  }
  const response = await requestEmpty(launch, timeoutMs)
  if (response.kind === 'timeout') {
    throw new Error('Desktop Host cookie bootstrap timed out')
  }
  if (response.kind === 'transport') {
    throw new Error('Desktop Host cookie bootstrap transport failed')
  }
  if (response.status !== 303) {
    throw new Error(`Desktop Host cookie bootstrap returned HTTP ${String(response.status)}`)
  }
  const locationHeader = response.headers.location
  const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader
  if (location === undefined) {
    throw new Error('Desktop Host cookie bootstrap omitted Location')
  }
  const redirected = new URL(location, expected)
  if (redirected.origin !== expected.origin || redirected.pathname !== '/') {
    throw new Error('Desktop Host cookie bootstrap redirected off the launch origin')
  }
  const cookie = cookieRequestHeader(response.headers['set-cookie'])
  if (cookie === undefined) {
    throw new Error('Desktop Host cookie bootstrap omitted Set-Cookie')
  }
  return cookie
}

/**
 * Read visible Sessions through generated Gateway `session/list`.
 * @param rpc - authenticated Desktop Host RPC.
 * @param options - optional timeout and cancellation.
 * @returns the Host list value or a typed failure.
 */
export function listDesktopHostSessions(
  rpc: DesktopHostRpc,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/list', { args: { _request: {} } }, options)
}

/**
 * Create or adopt one Session through generated Gateway `session/create`.
 * @param rpc - authenticated Desktop Host RPC.
 * @param sessionId - durable Session identity.
 * @returns the Host create value or a typed failure.
 */
export function createDesktopHostSession(
  rpc: DesktopHostRpc,
  sessionId: string,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/create', { args: { request: { sessionId } } }, options)
}

/**
 * Register one existing directory as a Workspace through generated Gateway `workspace/create`.
 * @param rpc - authenticated Desktop Host RPC.
 * @param path - existing directory path.
 * @returns the Host create value or a typed failure.
 */
export function createDesktopHostWorkspace(
  rpc: DesktopHostRpc,
  path: string,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('workspace/create', { args: { request: { path } } }, options)
}

function openOriginWebSocket(url: URL, origin: URL, cookieHeader?: string): WebSocket {
  if (url.hostname !== origin.hostname || url.port !== origin.port) {
    throw new TypeError('Desktop Host WebSocket must stay on the bootstrap origin')
  }
  return new WebSocket(url, {
    ...cookieHeader === undefined ? {} : { headers: { cookie: cookieHeader } },
  })
}

function settleSocket(
  settled: { value: boolean },
  cleanup: () => void,
  resolve: () => void,
  reject: (error: Error) => void,
  failure?: Error,
): void {
  if (settled.value) return
  settled.value = true
  cleanup()
  if (failure === undefined) resolve()
  else reject(failure)
}

function followRemoteMux(
  origin: URL,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
  accept: (frame: unknown) => void,
  cookieHeader?: string,
): Promise<void> {
  const url = new URL(REMOTE_STREAM_MUX_PATH, origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const streamId = randomUUID()
  return new Promise((resolve, reject) => {
    const socket = openOriginWebSocket(url, origin, cookieHeader)
    const settled = { value: false }
    let opened = false
    const cleanup = (): void => {
      signal.removeEventListener('abort', abort)
      socket.removeAllListeners()
    }
    const settle = (failure?: Error): void => {
      settleSocket(settled, cleanup, resolve, reject, failure)
    }
    const abort = (): void => {
      if (opened && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'cancel', streamId }))
      }
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
      settle()
    }
    const message = (data: WebSocket.RawData): void => {
      try {
        const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8')
        if (Buffer.byteLength(text) > MAX_HOST_PROJECTED_RESPONSE_BYTES) {
          throw new Error('Desktop Host event stream frame exceeded its byte ceiling')
        }
        const frame: unknown = JSON.parse(text)
        if (!isRecord(frame) || typeof frame.type !== 'string' || frame.streamId !== streamId) {
          throw new Error('Desktop Host Remote mux frame was invalid')
        }
        if (frame.type === 'item') {
          accept(frame.value)
          return
        }
        if (frame.type === 'end') {
          socket.close()
          settle()
          return
        }
        if (frame.type === 'error' && isRecord(frame.error) && typeof frame.error.message === 'string') {
          throw new Error(frame.error.message)
        }
        throw new Error('Desktop Host Remote mux frame was invalid')
      } catch (cause) {
        socket.close()
        settle(cause instanceof Error ? cause : new Error('Desktop Host Remote mux frame was invalid', { cause }))
      }
    }
    socket.once('open', () => {
      opened = true
      socket.send(JSON.stringify({ type: 'open', streamId, endpoint, payload }))
    })
    socket.on('message', message)
    socket.once('close', () => {
      settle(signal.aborted || settled.value ? undefined : new Error('Desktop Host event stream closed'))
    })
    socket.once('error', () => { settle(new Error('Desktop Host event stream failed')) })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

function cookieRequestHeader(setCookie: string | readonly string[] | undefined): string | undefined {
  const values = typeof setCookie === 'string' ? [setCookie] : setCookie === undefined ? [] : [...setCookie]
  const cookies = values.map((entry) => {
    const at = entry.indexOf(';')
    return (at === -1 ? entry : entry.slice(0, at)).trim()
  }).filter(entry => entry.length > 0)
  return cookies.length === 0 ? undefined : cookies.join('; ')
}

function requestEmpty(url: URL, timeoutMs: number): Promise<RequestOutcome> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (outcome: RequestOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      resolve(outcome)
    }
    const upstream = startRequest(url, { method: 'GET' }, (incoming) => {
      incoming.resume()
      incoming.on('error', () => { settle({ kind: 'transport' }) })
      settle({
        kind: 'response',
        status: incoming.statusCode ?? 500,
        text: '',
        headers: incoming.headers,
      })
      incoming.destroy()
      upstream.destroy()
    })
    const deadline = setTimeout(() => {
      settle({ kind: 'timeout' })
      upstream.destroy()
    }, timeoutMs)
    deadline.unref()
    upstream.on('error', () => { settle({ kind: 'transport' }) })
    upstream.end()
  })
}

function requestJson(
  url: URL,
  body: unknown,
  timeoutMs: number,
  responseMaxBytes: number,
  signal?: AbortSignal,
  cookieHeader?: string,
): Promise<RequestOutcome> {
  const encoded = JSON.stringify(body)
  return new Promise((resolve) => {
    let settled = false
    const abort = (): void => {
      settle({ kind: 'transport' })
      upstream.destroy()
    }
    const settle = (outcome: RequestOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      signal?.removeEventListener('abort', abort)
      resolve(outcome)
    }
    const upstream = startRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(encoded)),
        ...cookieHeader === undefined ? {} : { cookie: cookieHeader },
      },
    }, (incoming) => {
      incoming.on('error', () => { settle({ kind: 'transport' }) })
      const status = incoming.statusCode ?? 500
      if (status < 200 || status >= 300) {
        settle({ kind: 'response', status, text: '' })
        incoming.destroy()
        upstream.destroy()
        return
      }
      const chunks: Buffer[] = []
      let receivedBytes = 0
      incoming.on('data', (chunk) => {
        if (settled) return
        const bytes = Buffer.from(chunk as Uint8Array)
        receivedBytes += bytes.byteLength
        if (receivedBytes > responseMaxBytes) {
          settle({ kind: 'limit' })
          incoming.destroy()
          upstream.destroy()
          return
        }
        chunks.push(bytes)
      })
      incoming.on('end', () => {
        if (settled) return
        settle({
          kind: 'response',
          status,
          text: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    const deadline = setTimeout(() => {
      settle({ kind: 'timeout' })
      upstream.destroy()
    }, timeoutMs)
    deadline.unref()
    upstream.on('error', () => { settle({ kind: 'transport' }) })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
      return
    }
    upstream.end(encoded)
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
