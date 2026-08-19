/** HTTPS upload/consume/revoke Consumer for the encrypted attachment blob store. */

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { PersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import { parseAttachmentCapability, type AttachmentCapability } from '@deepseek-ai/dsh-remote-protocol'
import z from '@deepseek-ai/schemastery'
import { RemoteAttachmentError, type RemoteAttachmentErrorCode } from './index.ts'

const MAX_JSON_BYTES = 4 * 1024

/** HTTP Consumer configuration. */
export interface Config {
  /** Trusted browser origin allowed to call the routes. */
  origin: string
}
/** Validated HTTP Consumer configuration. */
export const Config: z<Config> = z.object({ origin: z.string().required() })
/** Cordis plugin name. */
export const name = 'remote-attachments-http'
/** Required blob store, pairing authority, and HTTP route registry. */
export const inject = ['webServer', 'remoteAttachments', 'remoteAttachmentAuthority']

/**
 * Pairing scope seam: the Personal Pairing layer authenticates one HTTPS request
 * to exactly one Personal Pairing. Implementations never see attachment bytes.
 */
export interface RemoteAttachmentAuthority {
  /**
   * Authenticate one attachment request to its owning Personal Pairing.
   * @param input - complete untrusted request headers.
   * @returns the Personal Pairing whose scope governs the capability.
   */
  authenticate(input: { headers: IncomingHttpHeaders }): Promise<PersonalPairingId>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteAttachmentAuthority: RemoteAttachmentAuthority
  }
}

const STORE_FAILURE_STATUS: Record<RemoteAttachmentErrorCode, number> = {
  ATTACHMENT_CAPABILITY_INVALID: 404,
  ATTACHMENT_EXPIRED: 410,
  ATTACHMENT_PAIRING_MISMATCH: 403,
  ATTACHMENT_LIMIT_EXCEEDED: 413,
  ATTACHMENT_CAPACITY: 503,
}

type AttachmentRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  pairingId: PersonalPairingId,
) => Promise<void>

/** Register the bounded attachment blob routes over the mounted blob store. */
export function apply(ctx: Context, config: Config): void {
  const origin = new URL(config.origin).origin
  const store = ctx.remoteAttachments
  /** Wrap one route with the shared CORS, method, pairing-authentication, and failure preludes. */
  const route = (handle: AttachmentRouteHandler) =>
    async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      try {
        if (handleCors(req, res, origin)) return
        if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Remote Attachments route requires POST')
        await handle(req, res, await ctx.remoteAttachmentAuthority.authenticate({ headers: req.headers }))
      } catch (error) {
        answerError(res, error)
      }
    }
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/v1/remote-attachments',
    handler: route(async (req, res, pairingId) => {
      const ciphertext = await readBounded(req, store.maxBlobBytes, () =>
        new HttpError(413, 'ATTACHMENT_LIMIT_EXCEEDED', 'Remote attachment exceeds the per-blob byte ceiling'))
      const grant = await store.publish({ pairingId, ciphertext: new Uint8Array(ciphertext), now: Date.now() })
      answerJson(res, 201, {
        capability: grant.capability,
        byteLength: grant.byteLength,
        expiresAt: grant.expiresAt,
      })
    }),
  }), 'remote-attachments: upload route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/v1/remote-attachments/consume',
    handler: route(async (req, res, pairingId) => {
      const body = await readJson(req)
      const ciphertext = await store.consume({
        pairingId,
        capability: parseCapability(body.capability),
        now: Date.now(),
      })
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(ciphertext)
    }),
  }), 'remote-attachments: consume route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/v1/remote-attachments/revoke',
    handler: route(async (req, res) => {
      const body = await readJson(req)
      await store.revoke(parseCapability(body.capability))
      res.writeHead(204).end()
    }),
  }), 'remote-attachments: revoke route')
}

function parseCapability(value: unknown): AttachmentCapability {
  if (typeof value !== 'string') throw new HttpError(400, 'BODY_INVALID', 'capability must be a string')
  try {
    return parseAttachmentCapability(value)
  } catch {
    throw new HttpError(400, 'BODY_INVALID', 'capability must be 43 canonical base64url characters')
  }
}

async function readBounded(
  req: IncomingMessage,
  limit: number,
  exceed: () => HttpError,
): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > limit) throw exceed()
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    received += buffer.byteLength
    if (received > limit) throw exceed()
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBounded(req, MAX_JSON_BYTES, () =>
    new HttpError(413, 'BODY_TOO_LARGE', 'Remote Attachments body is too large'))
  let value: unknown
  try {
    value = JSON.parse(body.toString('utf8')) as unknown
  } catch {
    throw new HttpError(400, 'BODY_INVALID', 'Remote Attachments body must be JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'BODY_INVALID', 'Remote Attachments body must be an object')
  }
  return value as Record<string, unknown>
}

function handleCors(req: IncomingMessage, res: ServerResponse, allowedOrigin: string): boolean {
  const requestOrigin = req.headers.origin
  if (requestOrigin !== undefined) {
    if (parseRequestOrigin(requestOrigin) !== allowedOrigin) {
      throw new HttpError(403, 'ORIGIN_DENIED', 'Remote Attachments request origin is not trusted')
    }
    res.setHeader('access-control-allow-origin', allowedOrigin)
    res.setHeader('vary', 'Origin')
  }
  if (req.method !== 'OPTIONS') return false
  res.writeHead(204, {
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '600',
  })
  res.end()
  return true
}

/** Parse one Origin header; a malformed value can never equal the trusted origin. */
function parseRequestOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin
  } catch {
    // Only the equality check above consumes the parsed origin, so a malformed header falls through to denial.
    return undefined
  }
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } as const

function answerJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, JSON_HEADERS).end(JSON.stringify(value))
}

function answerError(res: ServerResponse, error: unknown): void {
  const { status, body } = toFailureView(error)
  answerJson(res, status, body)
}

function toFailureView(error: unknown): { status: number; body: { error: { code: string; message: string } } } {
  if (error instanceof RemoteAttachmentError) {
    return { status: STORE_FAILURE_STATUS[error.code], body: { error: { code: error.code, message: error.message } } }
  }
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } }
  }
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Remote Attachments request failed' } } }
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}
