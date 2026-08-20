import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  HttpError,
  readJsonObject,
  writeHttpError,
  writeJson,
  writeRetryAfterError,
} from '../src/http-json.ts'

const LIMITS = {
  maxBytes: 16,
  tooLarge: { status: 413, code: 'TOO_LARGE', message: 'body exceeds 16 bytes' },
  invalidJson: { status: 400, code: 'BAD_JSON', message: 'body is not JSON' },
  notObject: { status: 400, code: 'BAD_OBJECT', message: 'body is not an object' },
} as const

function request(...chunks: Array<Buffer | Uint8Array | string>): IncomingMessage {
  return Readable.from(chunks) as IncomingMessage
}

function response(): ServerResponse & {
  readonly statusCode: number
  readonly headers: Record<string, string>
  readonly body: string
} {
  let statusCode = 0
  const headers: Record<string, string> = {}
  let body = ''
  return {
    get statusCode() { return statusCode },
    get headers() { return headers },
    get body() { return body },
    setHeader(name: string, value: string) { headers[name] = value },
    writeHead(status: number, next: Record<string, string>) {
      statusCode = status
      Object.assign(headers, next)
    },
    end(value: string) { body = value },
  } as unknown as ServerResponse & {
    readonly statusCode: number
    readonly headers: Record<string, string>
    readonly body: string
  }
}

describe('HTTP JSON helpers', () => {
  it('parses an object from Buffer and Uint8Array chunks', async () => {
    await expect(readJsonObject(
      request(Buffer.from('{"a":'), new Uint8Array(Buffer.from('1}'))),
      LIMITS,
    )).resolves.toEqual({ a: 1 })
  })

  it('rejects an oversized body, invalid JSON, and a non-object', async () => {
    await expect(readJsonObject(request('{"value":"0123456789"}'), LIMITS))
      .rejects.toMatchObject({ name: 'HttpError', status: 413, code: 'TOO_LARGE', message: 'body exceeds 16 bytes' })
    await expect(readJsonObject(request('{'), LIMITS))
      .rejects.toMatchObject({ status: 400, code: 'BAD_JSON', message: 'body is not JSON' })
    await expect(readJsonObject(request('null'), LIMITS))
      .rejects.toMatchObject({ status: 400, code: 'BAD_OBJECT', message: 'body is not an object' })
    await expect(readJsonObject(request('[]'), LIMITS))
      .rejects.toMatchObject({ status: 400, code: 'BAD_OBJECT' })
  })

  it('writes JSON, HttpError, and retryable domain errors', () => {
    const json = response()
    writeJson(json, 201, { id: 'attempt-1' })
    expect(json.statusCode).toBe(201)
    expect(json.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(json.headers['cache-control']).toBe('no-store')
    expect(json.body).toBe('{"id":"attempt-1"}')

    const http = response()
    writeHttpError(http, new HttpError(400, 'INVALID_JSON', 'Account request body is not valid JSON'))
    expect(http.statusCode).toBe(400)
    expect(JSON.parse(http.body)).toEqual({
      error: { code: 'INVALID_JSON', message: 'Account request body is not valid JSON' },
    })

    const retry = response()
    writeRetryAfterError(retry, { code: 'QUOTA', message: 'full', retryAfter: 45 }, 429)
    expect(retry.statusCode).toBe(429)
    expect(retry.headers['retry-after']).toBe('45')
    expect(JSON.parse(retry.body)).toEqual({
      error: { code: 'QUOTA', message: 'full', retryAfter: 45 },
    })

    const plain = response()
    writeRetryAfterError(plain, { code: 'CONFLICT', message: 'busy' }, 409)
    expect(plain.headers['retry-after']).toBeUndefined()
    expect(JSON.parse(plain.body)).toEqual({ error: { code: 'CONFLICT', message: 'busy' } })
  })
})
