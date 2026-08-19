/** HTTP Consumer for authenticated Remote Access Personal Pairing operations. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { parseAccountProofJti, type AccountProof } from '@deepseek-ai/dsh-platform-account'
import {
  RemoteAccessError,
  parsePairingChallengeId,
  parsePairingCompletionId,
  parsePairingRendezvousId,
  parsePendingPairingId,
  parsePersonalPairingId,
  type PairingAccountAuthentication,
  type PairingCompletionView,
} from '@deepseek-ai/dsh-remote-access'
import type {} from '@deepseek-ai/dsh-host-webserver'

const MAX_JSON_BYTES = 64 * 1024

/** HTTP Consumer configuration. */
export interface Config {
  /** Trusted browser origin allowed to call the route. */
  origin: string
}
/** Validated HTTP Consumer configuration. */
export const Config: z<Config> = z.object({ origin: z.string().required() })
/** Cordis plugin name. */
export const name = 'remote-access-http'
/** Required Remote Access behavior and HTTP route registry. */
export const inject = ['remoteAccess', 'webServer']

/** Register the authenticated Personal Pairing route. */
export function apply(ctx: Context, config: Config): void {
  const origin = new URL(config.origin).origin
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/v1/remote-access/personal-pairing',
    handler: async (req, res) => {
      try {
        if (handleCors(req, res, origin)) return
        if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Remote Access route requires POST')
        const authentication = authenticationFromHeaders(req)
        const body = await readJson(req)
        const result = await dispatch(ctx, authentication, body)
        answerJson(res, 200, result)
      } catch (error) {
        answerError(res, error)
      }
    },
  }))
}

async function dispatch(
  ctx: Context,
  authentication: PairingAccountAuthentication,
  body: Record<string, unknown>,
): Promise<unknown> {
  switch (requiredString(body.operation, 'operation')) {
    case 'get-mobile-access': return ctx.remoteAccess.getMobileAccessState(authentication)
    case 'set-mobile-access':
      return ctx.remoteAccess.setMobileAccess({ desktop: authentication, enabled: requiredBoolean(body.enabled, 'enabled') })
    case 'reissue-desktop-relay': return ctx.remoteAccess.reissueDesktopRelayAuthority(authentication)
    case 'create-challenge':
      return ctx.remoteAccess.createChallenge({
        desktop: authentication,
        rendezvousId: parsePairingRendezvousId(body.rendezvousId),
      })
    case 'cancel-challenge':
      await ctx.remoteAccess.cancelChallenge({
        desktop: authentication,
        challengeId: parsePairingChallengeId(body.challengeId),
      })
      return { completed: true }
    case 'list-pending': return (await ctx.remoteAccess.listPendingPairings(authentication)).map(completionWire)
    case 'list-pairings': return ctx.remoteAccess.listPersonalPairings(authentication)
    case 'revoke-pairing':
      await ctx.remoteAccess.revokePersonalPairing({
        desktop: authentication,
        pairingId: parsePersonalPairingId(body.pairingId),
      })
      return { completed: true }
    case 'get-mobile-pairing-status':
      return mobilePairingStatusWire(await ctx.remoteAccess.getMobilePairingStatus({
        mobile: authentication,
        pendingPairingId: parsePendingPairingId(body.pendingPairingId),
      }))
    case 'confirm-pairing':
      return ctx.remoteAccess.confirmPairing({
        desktop: authentication,
        pendingPairingId: parsePendingPairingId(body.pendingPairingId),
      })
    case 'reject-pairing':
      await ctx.remoteAccess.rejectPairing({
        desktop: authentication,
        pendingPairingId: parsePendingPairingId(body.pendingPairingId),
      })
      return { completed: true }
    case 'complete-challenge':
      return completionWire(await ctx.remoteAccess.completeChallenge({
        mobile: authentication,
        completionId: parsePairingCompletionId(body.completionId),
        oneTimeLink: requiredString(body.oneTimeLink, 'oneTimeLink'),
        device: parseDevice(body.device),
        mobileHandshake: decodeBytes(body.mobileHandshake, 'mobileHandshake'),
      }))
    default: throw new HttpError(400, 'OPERATION_INVALID', 'Remote Access operation is invalid')
  }
}

function completionWire(value: PairingCompletionView): unknown {
  return { ...value, desktopHandshake: encodeBytes(value.desktopHandshake) }
}

function mobilePairingStatusWire(value: Awaited<ReturnType<Context['remoteAccess']['getMobilePairingStatus']>>): unknown {
  if (value.status !== 'paired' || value.sealedRelayAuthority === undefined) return value
  return { ...value, sealedRelayAuthority: encodeBytes(value.sealedRelayAuthority) }
}

function authenticationFromHeaders(req: IncomingMessage): PairingAccountAuthentication {
  return { accessToken: bearer(req), proof: proofHeaders(req) }
}

function bearer(req: IncomingMessage): string {
  const value = req.headers.authorization
  if (typeof value !== 'string' || !value.startsWith('Bearer ') || value.length === 7) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Platform Account bearer token is required')
  }
  return value.slice(7)
}

function proofHeaders(req: IncomingMessage): AccountProof {
  const jti = singleHeader(req, 'x-gestalt-proof-jti')
  const issuedAt = Number(singleHeader(req, 'x-gestalt-proof-issued-at'))
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    throw new HttpError(400, 'PROOF_INVALID', 'Installation proof issuedAt is invalid')
  }
  return {
    jti: parseAccountProofJti(jti),
    issuedAt,
    signature: singleHeader(req, 'x-gestalt-proof-signature'),
  }
}

function singleHeader(req: IncomingMessage, name: string): string {
  const value = req.headers[name]
  if (typeof value !== 'string' || value === '') throw new HttpError(400, 'PROOF_INVALID', `Missing ${name}`)
  return value
}

function parseDevice(value: unknown): { name: string; platform: 'ios' | 'android' } {
  if (!isRecord(value)) throw new HttpError(400, 'DEVICE_INVALID', 'Pairing device must be an object')
  const platform = value.platform
  if (platform !== 'ios' && platform !== 'android') {
    throw new HttpError(400, 'DEVICE_INVALID', 'Pairing device platform is invalid')
  }
  return { name: requiredString(value.name, 'device.name'), platform }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const piece of req) {
    const next = Buffer.isBuffer(piece) ? piece : Buffer.from(piece as Uint8Array)
    total += next.byteLength
    if (total > MAX_JSON_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE', 'Remote Access body is too large')
    chunks.push(next)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new HttpError(400, 'BODY_INVALID', 'Remote Access body must be JSON')
  }
  if (!isRecord(parsed)) throw new HttpError(400, 'BODY_INVALID', 'Remote Access body must be an object')
  return parsed
}

function handleCors(req: IncomingMessage, res: ServerResponse, allowedOrigin: string): boolean {
  const requestOrigin = req.headers.origin
  if (requestOrigin !== undefined) {
    let parsedOrigin: string
    try {
      parsedOrigin = new URL(requestOrigin).origin
    } catch {
      throw new HttpError(403, 'ORIGIN_DENIED', 'Remote Access request origin is not trusted')
    }
    if (parsedOrigin !== allowedOrigin) {
      throw new HttpError(403, 'ORIGIN_DENIED', 'Remote Access request origin is not trusted')
    }
  }
  if (requestOrigin !== undefined) {
    res.setHeader('access-control-allow-origin', allowedOrigin)
    res.setHeader('vary', 'Origin')
  }
  if (req.method !== 'OPTIONS') return false
  res.writeHead(204, {
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-gestalt-proof-jti,x-gestalt-proof-issued-at,x-gestalt-proof-signature',
    'access-control-max-age': '600',
  })
  res.end()
  return true
}

function answerJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

function answerError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    answerJson(res, error.status, { error: { code: error.code, message: error.message } })
    return
  }
  if (error instanceof RemoteAccessError) {
    const body = { error: { code: error.code, message: error.message } }
    answerJson(res, 409, body)
    return
  }
  answerJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Remote Access request failed' } })
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new HttpError(400, 'BODY_INVALID', `${name} must be non-empty`)
  return value
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, 'BODY_INVALID', `${name} must be boolean`)
  return value
}

function encodeBytes(value: Uint8Array): string { return Buffer.from(value).toString('base64url') }

function decodeBytes(value: unknown, name: string): Uint8Array {
  const encoded = requiredString(value, name)
  if (!/^[A-Za-z0-9_-]*$/u.test(encoded) || encoded.length % 4 === 1) {
    throw new HttpError(400, 'BODY_INVALID', `${name} must be canonical base64url`)
  }
  const decoded = Buffer.from(encoded, 'base64url')
  if (decoded.toString('base64url') !== encoded) throw new HttpError(400, 'BODY_INVALID', `${name} must be canonical base64url`)
  return new Uint8Array(decoded)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export { RelayWebSocketConsumer } from './relay.ts'
