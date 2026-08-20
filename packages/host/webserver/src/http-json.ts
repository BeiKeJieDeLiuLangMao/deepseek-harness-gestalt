/** Bounded JSON object reader and JSON error writer for HTTP route owners. */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** HTTP failure with a status and protocol error code. */
export class HttpError extends Error {
  /**
   * @param status - HTTP status written to the response.
   * @param code - protocol error code in the JSON body.
   * @param message - human-readable failure text.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/** Status, code, and message thrown when a JSON body is rejected. */
export interface JsonBodyFailure {
  readonly status: number
  readonly code: string
  readonly message: string
}

/** Byte ceiling and protocol-specific rejection text for `readJsonObject`. */
export interface JsonBodyLimits {
  readonly maxBytes: number
  readonly tooLarge: JsonBodyFailure
  readonly invalidJson: JsonBodyFailure
  readonly notObject: JsonBodyFailure
}

function throwFailure(failure: JsonBodyFailure): never {
  throw new HttpError(failure.status, failure.code, failure.message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read a JSON object from the request with a byte ceiling.
 * @param req - incoming HTTP request.
 * @param limits - max bytes and protocol-specific rejection text.
 * @returns the parsed object body.
 */
export async function readJsonObject(
  req: IncomingMessage,
  limits: JsonBodyLimits,
): Promise<Record<string, unknown>> {
  let bytes = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    bytes += buffer.byteLength
    if (bytes > limits.maxBytes) throwFailure(limits.tooLarge)
    chunks.push(buffer)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throwFailure(limits.invalidJson)
  }
  if (!isRecord(value)) throwFailure(limits.notObject)
  return value
}

/**
 * Write a JSON body with the no-store cache header.
 * @param res - HTTP response.
 * @param status - HTTP status.
 * @param value - JSON-serializable body.
 */
export function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

/**
 * Write an `HttpError` as `{ error: { code, message } }`.
 * @param res - HTTP response.
 * @param error - status, code, and message to emit.
 */
export function writeHttpError(res: ServerResponse, error: HttpError): void {
  writeJson(res, error.status, { error: { code: error.code, message: error.message } })
}

/**
 * Write a domain error that may carry `Retry-After`.
 * @param res - HTTP response.
 * @param error - protocol code, message, and optional retry delay in seconds.
 * @param status - HTTP status chosen by the route owner.
 */
export function writeRetryAfterError(
  res: ServerResponse,
  error: { readonly code: string; readonly message: string; readonly retryAfter?: number },
  status: number,
): void {
  if (error.retryAfter !== undefined) res.setHeader('retry-after', String(error.retryAfter))
  writeJson(res, status, {
    error: {
      code: error.code,
      message: error.message,
      ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
    },
  })
}
