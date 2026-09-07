/** Typed loopback RPC from Desktop Host to its bundled Web Host. */

import { randomUUID } from 'node:crypto'
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'
import WebSocket from 'ws'
import {
  parseRemoteEventDownlinkFrame,
  parseRemoteEventReadyFrame,
  parseRemoteEventResult,
  parseRemoteStreamServerMessage,
  REMOTE_EVENT_RESULT_ENDPOINT,
  REMOTE_EVENT_STREAM_ENDPOINT,
  REMOTE_EVENT_STREAM_PAYLOAD,
  REMOTE_STREAM_MUX_PATH,
  type RemoteEventDownlinkFrame,
  type RemoteEventReadyFrame,
  type RemoteEventResult,
} from '@deepseek-ai/dsh-api-gateway'
import {
  REMOTE_PROTOCOL_LIMITS,
  type CompanionHostFailure,
} from '@deepseek-ai/dsh-remote-protocol'

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
   * Follow Gateway `$events` on `/api/remote.mux`.
   * Cookie is sent only to the bootstrap origin. Abort sends mux `cancel`.
   */
  followEvents(
    signal: AbortSignal,
    accept: (frame: RemoteEventDownlinkFrame | RemoteEventReadyFrame) => void,
  ): Promise<void>
  /**
   * Settle one Host waterfall through Gateway `$events/result`.
   * Completed or replaced events are Gateway no-ops, not Host `not-pending`.
   */
  completeEvent(
    result: RemoteEventResult,
  ): Promise<DesktopHostRpcResult>
  /**
   * Follow generated Gateway `session/follow` on `/api/remote.mux`.
   * Cookie is sent only to the bootstrap origin. Abort sends mux `cancel`.
   */
  followSession(
    sessionId: string,
    signal: AbortSignal,
    accept: (frame: unknown) => void,
    maxMessages?: number,
  ): Promise<void>
  /**
   * Follow generated Gateway `workspace/follow` on `/api/remote.mux`.
   * Cookie is sent only to the bootstrap origin. Abort sends mux `cancel`.
   */
  followWorkspaces(
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
  const rpc: DesktopHostRpc = {
    async call(method, payload, callOptions) {
      const attachmentRead = method === 'session/attachment'
      const projectedRead = method === 'session/list' || method === 'session/page'
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
    followEvents: async (signal, accept) => {
      let ready = false
      await followRemoteMux(
        origin,
        REMOTE_EVENT_STREAM_ENDPOINT,
        REMOTE_EVENT_STREAM_PAYLOAD,
        signal,
        (frame) => {
          if (!ready) {
            accept(parseRemoteEventReadyFrame(frame))
            ready = true
            return
          }
          accept(parseRemoteEventDownlinkFrame(frame))
        },
        options.cookieHeader,
      )
    },
    completeEvent: async (result) => {
      parseRemoteEventResult(result)
      return rpc.call(REMOTE_EVENT_RESULT_ENDPOINT, { args: result })
    },
    followSession: async (sessionId, signal, accept, maxMessages) => {
      await followRemoteMux(
        origin,
        'session/follow',
        {
          args: {
            request: {
              address: { kind: 'session', sessionId },
              ...maxMessages === undefined ? {} : { maxMessages },
            },
          },
        },
        signal,
        accept,
        options.cookieHeader,
      )
    },
    followWorkspaces: async (signal, accept) => {
      await followRemoteMux(origin, 'workspace/follow', { args: {} }, signal, accept, options.cookieHeader)
    },
  }
  return rpc
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
  if (typeof result.error.code !== 'string' || result.error.code === '') {
    return { ok: false, failure: INVALID_HOST_BUSINESS_CODE }
  }
  const hostMessage = typeof result.error.message === 'string' && result.error.message !== ''
    ? result.error.message
    : 'Desktop Host rejected the request'
  return { ok: false, failure: companionBusinessFailure(result.error.code, hostMessage) }
}

/** Gateway/Session Host codes are `<domain>/<reason>` segments, or a bare reason. */
const HOST_DIAGNOSTIC_CODE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u
const COMPANION_BUSINESS_CODE = /^[A-Za-z0-9_-]{1,128}$/u
const HOST_DIAGNOSTIC_CODE_MAX = 128
const INVALID_HOST_BUSINESS_CODE: CompanionHostFailure = {
  kind: 'wire',
  code: 'HOST_WIRE_INVALID',
  message: 'Desktop Host business error code was invalid',
}

/**
 * Companion business `code` rejects `/`. Keep the Host reason as a legal
 * last-segment `code`. A validated namespaced Host diagnostic is retained as
 * `[<original Host code>] ` before the original user-visible message.
 * Illegal types, empty segments, newlines, or over-long Host codes stay
 * `HOST_WIRE_INVALID` and are not copied into the prefix. The prefix never
 * consumes the 4096-byte message ceiling. Retry classification stays `kind`.
 */
function companionBusinessFailure(hostCode: string, hostMessage: string): CompanionHostFailure {
  if (!isHostDiagnosticCode(hostCode)) return INVALID_HOST_BUSINESS_CODE
  const slash = hostCode.lastIndexOf('/')
  const code = slash === -1 ? hostCode : hostCode.slice(slash + 1)
  if (!COMPANION_BUSINESS_CODE.test(code)) return INVALID_HOST_BUSINESS_CODE
  if (slash === -1) {
    return { kind: 'business', code, message: boundedFailureMessage(hostMessage) }
  }
  const message = prefixedHostFailureMessage(hostCode, hostMessage)
  if (message === undefined) return INVALID_HOST_BUSINESS_CODE
  return { kind: 'business', code, message }
}

function isHostDiagnosticCode(hostCode: string): boolean {
  return hostCode.length <= HOST_DIAGNOSTIC_CODE_MAX && HOST_DIAGNOSTIC_CODE.test(hostCode)
}

function prefixedHostFailureMessage(hostCode: string, hostMessage: string): string | undefined {
  const prefix = `[${hostCode}] `
  const limit = REMOTE_PROTOCOL_LIMITS.hostFailureMessageBytes
  const prefixBytes = new TextEncoder().encode(prefix).byteLength
  if (prefixBytes >= limit) return undefined
  return prefix + utf8Truncate(hostMessage, limit - prefixBytes)
}

function boundedFailureMessage(hostMessage: string): string {
  return utf8Truncate(hostMessage, REMOTE_PROTOCOL_LIMITS.hostFailureMessageBytes)
}

function utf8Truncate(value: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(value)
  if (encoded.byteLength <= maxBytes) return value
  if (maxBytes <= 0) return ''
  let end = maxBytes
  const start = utf8CharStart(encoded, end - 1)
  const width = utf8LeadWidth(encoded[start] ?? 0)
  if (start + width > maxBytes) end = start
  return new TextDecoder('utf-8', { fatal: true }).decode(encoded.subarray(0, end))
}

function utf8CharStart(bytes: Uint8Array, index: number): number {
  let start = index
  while (start > 0 && ((bytes[start] ?? 0) & 0xc0) === 0x80) start -= 1
  return start
}

function utf8LeadWidth(lead: number): number {
  if ((lead & 0x80) === 0) return 1
  if ((lead & 0xe0) === 0xc0) return 2
  if ((lead & 0xf0) === 0xe0) return 3
  if ((lead & 0xf8) === 0xf0) return 4
  return 1
}

type RequestOutcome =
  | { kind: 'response'; status: number; text: string; headers?: IncomingMessage['headers'] }
  | { kind: 'timeout' }
  | { kind: 'transport' }
  | { kind: 'limit' }

type EmptyRequestOutcome =
  | { kind: 'response'; status: number; text: string; headers: IncomingMessage['headers'] }
  | { kind: 'timeout' }
  | { kind: 'transport' }

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
  const location = response.headers.location
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
 * @param options - optional timeout, cancellation, and Session project directory.
 * @returns the Host create value or a typed failure.
 */
export function createDesktopHostSession(
  rpc: DesktopHostRpc,
  sessionId: string,
  options?: { timeoutMs?: number; signal?: AbortSignal; cwd?: string; rpcId?: string },
): Promise<DesktopHostRpcResult> {
  const { cwd, ...callOptions } = options ?? {}
  return createDesktopHostSessionRequest(rpc, {
    sessionId,
    ...(cwd === undefined ? {} : { cwd }),
  }, Object.keys(callOptions).length === 0 ? undefined : callOptions)
}

/**
 * Create or adopt one Session through generated Gateway `session/create`.
 * @param rpc - authenticated Desktop Host RPC.
 * @param request - generated create request fields.
 * @param options - optional timeout, cancellation, and initiator rpc id.
 * @returns the Host create value or a typed failure.
 */
export function createDesktopHostSessionRequest(
  rpc: DesktopHostRpc,
  request: { sessionId?: string; workspaceId?: string; cwd?: string },
  options?: { timeoutMs?: number; signal?: AbortSignal; rpcId?: string },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/create', { args: { request } }, options)
}

/**
 * Search visible Session content through generated Gateway `session/search`.
 * @param rpc - authenticated Desktop Host RPC.
 * @param query - literal message-content query.
 * @param options - optional timeout and cancellation.
 * @returns the Host search value or a typed failure.
 */
export function searchDesktopHostSessions(
  rpc: DesktopHostRpc,
  query: string,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/search', { args: { request: { query } } }, options)
}

/**
 * Read one image proven reachable from the Session log through generated Gateway `session/attachment`.
 * @param rpc - authenticated Desktop Host RPC.
 * @param request - Session and image attachment identities.
 * @param options - optional timeout and cancellation.
 * @returns the Host image value or a typed failure.
 */
export function readDesktopHostAttachment(
  rpc: DesktopHostRpc,
  request: { sessionId: string; attachmentId: string },
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/attachment', { args: { request } }, options)
}

/**
 * Admit one Companion opaque file through generated Gateway `session/admitAttachment`.
 * @param rpc - authenticated Desktop Host RPC.
 * @param request - Session identity, Companion operation id, media type, name, and canonical base64.
 * @param options - optional timeout and cancellation.
 * @returns the Host admission value or a typed failure.
 */
export function admitDesktopHostAttachment(
  rpc: DesktopHostRpc,
  request: {
    sessionId: string
    operationId: string
    mediaType: string
    name: string
    data: string
  },
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/admitAttachment', { args: { request } }, options)
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

/**
 * Archive one Session through generated Gateway `workspace/archiveSession`.
 * @param rpc - authenticated Desktop Host RPC.
 * @param sessionId - Session identity to hide from Workspace grouping surfaces.
 * @returns the Host archive value or a typed failure.
 */
export function archiveDesktopHostSession(
  rpc: DesktopHostRpc,
  sessionId: string,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('workspace/archiveSession', { args: { request: { sessionId } } }, options)
}

/**
 * Admit one prompt through generated Gateway `session/prompt`.
 * `requestId` is the initiator identity; Host never mints a replacement.
 */
export function promptDesktopHostSession(
  rpc: DesktopHostRpc,
  request: {
    requestId: string
    sessionId: string
    mode: 'queue' | 'steer'
    content: ReadonlyArray<
      | { type: 'text'; text: string }
      | { type: 'image'; mediaType: string; data: string; name?: string }
    >
  },
  options?: { timeoutMs?: number; rpcId?: string; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/prompt', { args: { request } }, options)
}

/**
 * Cancel one live turn through generated Gateway `session/cancel`.
 */
export function cancelDesktopHostSession(
  rpc: DesktopHostRpc,
  sessionId: string,
  options?: { timeoutMs?: number; rpcId?: string; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/cancel', { args: { request: { sessionId } } }, options)
}

/**
 * Read one message-aligned history page through generated Gateway `session/page`.
 * `throughSeq` is the inclusive follow-snapshot cursor; `beforeSeq` and `maxMessages`
 * are forwarded to Host pagination and are not a client-side event-count cut.
 */
export function pageDesktopHostSession(
  rpc: DesktopHostRpc,
  request: {
    sessionId: string
    throughSeq: number
    beforeSeq?: number
    maxMessages?: number
  },
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DesktopHostRpcResult> {
  return rpc.call('session/page', {
    args: {
      request: {
        address: { kind: 'session', sessionId: request.sessionId },
        throughSeq: request.throughSeq,
        ...request.beforeSeq === undefined ? {} : { beforeSeq: request.beforeSeq },
        ...request.maxMessages === undefined ? {} : { maxMessages: request.maxMessages },
      },
    },
  }, options)
}

function openOriginWebSocket(url: URL, origin: URL, cookieHeader?: string): WebSocket {
  if (url.hostname !== origin.hostname || url.port !== origin.port) {
    throw new TypeError('Desktop Host WebSocket must stay on the bootstrap origin')
  }
  const socket = new WebSocket(url, {
    handshakeTimeout: 1_000,
    ...cookieHeader === undefined ? {} : { headers: { cookie: cookieHeader } },
  })
  socket.on('error', () => {})
  return socket
}

function closeOriginWebSocket(socket: WebSocket): void {
  if (socket.readyState === WebSocket.OPEN) socket.close()
}

function detachSocketListeners(signal: AbortSignal, abort: () => void, socket: WebSocket): void {
  signal.removeEventListener('abort', abort)
  socket.removeAllListeners('message')
  socket.removeAllListeners('open')
  socket.removeAllListeners('close')
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
      detachSocketListeners(signal, abort, socket)
    }
    const settle = (failure?: Error): void => {
      settleSocket(settled, cleanup, resolve, reject, failure)
    }
    const abort = (): void => {
      if (opened && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'cancel', streamId }))
      }
      closeOriginWebSocket(socket)
      settle()
    }
    const message = (data: WebSocket.RawData): void => {
      try {
        const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8')
        if (Buffer.byteLength(text) > MAX_HOST_PROJECTED_RESPONSE_BYTES) {
          throw new Error('Desktop Host event stream frame exceeded its byte ceiling')
        }
        const frame = parseRemoteStreamServerMessage(text)
        if (frame.streamId !== streamId) {
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
        throw new Error(frame.error.message)
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

function requestEmpty(url: URL, timeoutMs: number): Promise<EmptyRequestOutcome> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (outcome: EmptyRequestOutcome): void => {
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
