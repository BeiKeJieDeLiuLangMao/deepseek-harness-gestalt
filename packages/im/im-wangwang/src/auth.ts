/**
 * Native cryptographic signing and header construction for Wangwang OpenAPI requests.
 * Uses native node:crypto (HMAC-SHA256).
 *
 * Headers:
 * - x-api-access-key: Access key
 * - x-api-timestamp: Millisecond timestamp
 * - x-api-signature: Base64-encoded HMAC-SHA256
 * - x-api-request-id: Request tracking id (when provided)
 *
 * @module @deepseek-ai/dsh-im-wangwang/auth
 */

import { createHmac } from 'node:crypto'
import type { ResolvedWangwangCredentials, SignedWangwangRequest } from './types.ts'

export const WANGWANG_HEADERS = Object.freeze({
  accessKey: 'x-api-access-key',
  timestamp: 'x-api-timestamp',
  signature: 'x-api-signature',
  requestId: 'x-api-request-id',
} as const)

export type WangwangQueryValue = string | number | bigint | boolean | null | undefined

/**
 * Builds canonical sorted query string according to Wangwang protocol.
 */
export function buildWangwangSortedQuery(
  query: Readonly<Record<string, WangwangQueryValue>> = {},
): string {
  const pairs: Array<readonly [key: string, value: string]> = []
  for (const [rawKey, rawValue] of Object.entries(query)) {
    if (rawValue === null || rawValue === undefined) continue
    const encoded = new URLSearchParams([[rawKey, String(rawValue)]]).toString()
    const separator = encoded.indexOf('=')
    pairs.push([encoded.slice(0, separator), encoded.slice(separator + 1)])
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]))
  return pairs.map(([key, value]) => `${key}=${value}`).join('&')
}

/**
 * Computes deterministic HMAC-SHA256 signature for a request.
 * String to sign: `${method}\n${path}\n${queryString}\n${timestamp}`
 */
export function computeWangwangSignature(input: {
  readonly method: string
  readonly path: string
  readonly queryString: string
  readonly timestamp: string | number
  readonly secretKey: string
}): string {
  const stringToSign = `${input.method.toUpperCase()}\n${input.path}\n${input.queryString}\n${String(input.timestamp)}`
  return createHmac('sha256', input.secretKey).update(stringToSign, 'utf8').digest('base64')
}

/**
 * Signs a Wangwang request and returns headers and query string.
 */
export function signWangwangRequest(input: {
  readonly credentials: ResolvedWangwangCredentials
  readonly method: string
  readonly path: string
  readonly query?: Readonly<Record<string, WangwangQueryValue>>
  readonly timestamp: number
  readonly requestId?: string
}): SignedWangwangRequest {
  const method = input.method.toUpperCase()
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`
  const queryString = buildWangwangSortedQuery(input.query)
  const timestampStr = String(input.timestamp)

  const signature = computeWangwangSignature({
    method,
    path,
    queryString,
    timestamp: timestampStr,
    secretKey: input.credentials.secretKey,
  })

  return {
    queryString,
    headers: {
      [WANGWANG_HEADERS.accessKey]: input.credentials.accessKey,
      [WANGWANG_HEADERS.timestamp]: timestampStr,
      [WANGWANG_HEADERS.signature]: signature,
      ...(input.requestId ? { [WANGWANG_HEADERS.requestId]: input.requestId } : {}),
    },
  }
}
