/**
 * HTTP Consumer for Platform Account. It owns the fixed OAuth callback and
 * installation lifecycle routes, while the Account service owns behavior.
 * @module @deepseek-ai/dsh-platform-account-http
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  AccountError,
  parseAccountProofJti,
  parseInstallationId,
  parseLoginAttemptId,
  type AccountProof,
} from '@deepseek-ai/dsh-platform-account'
import type {} from '@deepseek-ai/dsh-host-webserver'

const MAX_JSON_BYTES = 64 * 1024

/** HTTP consumer configuration. */
export interface Config {
  /** Selected Platform environment origin allowed to call Account routes. */
  origin: string
}

/** Validated HTTP consumer configuration. */
export const Config: z<Config> = z.object({
  origin: z.string().required(),
})

/** Cordis plugin name. */
export const name = 'platform-account-http'
/** Required Account behavior and HTTP route registry. */
export const inject = ['platformAccount', 'webServer']

/** Register the complete Account HTTP route set. */
export function apply(ctx: Context, config: Config): void {
  const candidate: unknown = config
  if (candidate === null || typeof candidate !== 'object' || typeof (candidate as { origin?: unknown }).origin !== 'string') {
    throw new TypeError('Platform Account HTTP origin configuration is required')
  }
  const origin = (candidate as Config).origin
  if (origin !== ctx.platformAccount.environment.origin) {
    throw new TypeError('Platform Account HTTP origin does not match the selected Platform environment')
  }
  const origins = new Set([origin])
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): void => {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path,
      handler: async (req, res) => {
        try {
          if (handleCors(req, res, origins)) return
          await handler(req, res)
        } catch (error) {
          answerError(res, error)
        }
      },
    }))
  }

  route('/v1/account/login-attempts', async (req, res) => {
    requireMethod(req, 'POST')
    const body = await readJson(req)
    const attempt = await ctx.platformAccount.beginLogin({
      installationId: parseInstallationId(requiredString(body, 'installationId')),
      installationKind: requiredKind(body.installationKind),
      publicKey: requiredObject(body, 'publicKey'),
    })
    answerJson(res, 201, attempt)
  })

  route('/v1/account/oauth/github/callback', async (req, res) => {
    requireMethod(req, 'GET')
    const url = new URL(req.url ?? '/', 'https://platform.invalid')
    await ctx.platformAccount.completeGitHubCallback({
      code: requiredQuery(url, 'code'),
      state: requiredQuery(url, 'state'),
    })
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>DeepSeek Gestalt</title><body><main><h1>授权已完成 / Authorization complete</h1><p>请返回 DeepSeek Gestalt。You can return to DeepSeek Gestalt.</p></main></body></html>')
  })

  route('/v1/account/login-poll', async (req, res) => {
    requireMethod(req, 'POST')
    const body = await readJson(req)
    answerJson(res, 200, await ctx.platformAccount.pollLogin({
      attemptId: parseLoginAttemptId(requiredString(body, 'attemptId')),
      pollingToken: requiredString(body, 'pollingToken'),
      proof: requiredProof(body.proof),
    }))
  })

  route('/v1/account/session/refresh', async (req, res) => {
    requireMethod(req, 'POST')
    const body = await readJson(req)
    answerJson(res, 200, await ctx.platformAccount.refresh({
      refreshToken: requiredString(body, 'refreshToken'),
      proof: requiredProof(body.proof),
    }))
  })

  route('/v1/account/session', async (req, res) => {
    if (req.method === 'GET') {
      answerJson(res, 200, await ctx.platformAccount.current({
        accessToken: bearer(req),
        proof: proofHeaders(req),
      }))
      return
    }
    if (req.method === 'DELETE') {
      await ctx.platformAccount.signOut({ accessToken: bearer(req), proof: proofHeaders(req) })
      res.writeHead(204, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Account route method is not allowed')
  })
}

function handleCors(req: IncomingMessage, res: ServerResponse, origins: Set<string>): boolean {
  const origin = req.headers.origin
  if (origin !== undefined) {
    let normalized: string
    try {
      normalized = new URL(origin).origin
    } catch {
      throw new HttpError(403, 'ORIGIN_DENIED', 'Account request origin is invalid')
    }
    if (!origins.has(normalized)) throw new HttpError(403, 'ORIGIN_DENIED', 'Account request origin is not trusted')
    res.setHeader('access-control-allow-origin', normalized)
    res.setHeader('vary', 'Origin')
  }
  if (req.method !== 'OPTIONS') return false
  res.writeHead(204, {
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-gestalt-proof-jti,x-gestalt-proof-issued-at,x-gestalt-proof-signature',
    'access-control-max-age': '600',
  })
  res.end()
  return true
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let bytes = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    bytes += buffer.byteLength
    if (bytes > MAX_JSON_BYTES) throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Account request exceeds 65536 bytes')
    chunks.push(buffer)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Account request body is not valid JSON')
  }
  if (!isRecord(value)) throw new HttpError(400, 'INVALID_JSON', 'Account request body must be an object')
  return value
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value === '') throw new HttpError(400, 'INVALID_REQUEST', `${key} must be a non-empty string`)
  return value
}

function requiredObject(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key]
  if (!isRecord(value)) throw new HttpError(400, 'INVALID_REQUEST', `${key} must be an object`)
  return value
}

function requiredKind(value: unknown): 'desktop' | 'mobile' {
  if (value !== 'desktop' && value !== 'mobile') {
    throw new HttpError(400, 'INVALID_REQUEST', 'installationKind must be desktop or mobile')
  }
  return value
}

function requiredProof(value: unknown): AccountProof {
  if (!isRecord(value) || typeof value.jti !== 'string' || value.jti === '' || !Number.isSafeInteger(value.issuedAt)
    || typeof value.signature !== 'string') {
    throw new HttpError(400, 'INVALID_REQUEST', 'proof must contain jti, issuedAt, and signature')
  }
  return { jti: parseAccountProofJti(value.jti), issuedAt: value.issuedAt as number, signature: value.signature }
}

function requiredQuery(url: URL, key: string): string {
  const value = url.searchParams.get(key)
  if (value === null || value === '') throw new HttpError(400, 'INVALID_REQUEST', `${key} query parameter is required`)
  return value
}

function bearer(req: IncomingMessage): string {
  const authorization = req.headers.authorization
  if (authorization === undefined || !authorization.startsWith('Bearer ') || authorization.length === 7) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Bearer Account access token is required')
  }
  return authorization.slice(7)
}

function proofHeaders(req: IncomingMessage): AccountProof {
  const jti = req.headers['x-gestalt-proof-jti']
  const issuedAt = req.headers['x-gestalt-proof-issued-at']
  const signature = req.headers['x-gestalt-proof-signature']
  if (typeof jti !== 'string' || typeof issuedAt !== 'string' || typeof signature !== 'string') {
    throw new HttpError(400, 'INVALID_REQUEST', 'installation proof headers are required')
  }
  if (jti === '') throw new HttpError(400, 'INVALID_REQUEST', 'proof jti header is invalid')
  const parsed = Number(issuedAt)
  if (!Number.isSafeInteger(parsed)) throw new HttpError(400, 'INVALID_REQUEST', 'proof issued-at header is invalid')
  return { jti: parseAccountProofJti(jti), issuedAt: parsed, signature }
}

function requireMethod(req: IncomingMessage, method: string): void {
  if (req.method !== method) throw new HttpError(405, 'METHOD_NOT_ALLOWED', `Account route requires ${method}`)
}

function answerJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function answerError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    answerJson(res, error.status, { error: { code: error.code, message: error.message } })
    return
  }
  if (error instanceof AccountError) {
    if (error.retryAfter !== undefined) res.setHeader('retry-after', String(error.retryAfter))
    const status = error.code === 'QUOTA' || error.code === 'PLATFORM_CAPACITY'
      ? 429
      : error.code.startsWith('SESSION_') ? 401 : 400
    answerJson(res, status, {
      error: {
        code: error.code,
        message: error.message,
        ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
      },
    })
    return
  }
  answerJson(res, 500, { error: { code: 'INTERNAL', message: 'Platform Account request failed' } })
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
