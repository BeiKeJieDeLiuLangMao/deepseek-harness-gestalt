import { EventEmitter } from 'node:events'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  deriveCompanionAttachmentKey,
  openCompanionAttachment,
  sealCompanionAttachment,
} from '@deepseek-ai/dsh-remote-protocol'
import { RemoteAttachmentStoreProvider, type RemoteAttachmentStoreOptions } from '../src/index.ts'
import { apply } from '../src/http.ts'
import {
  downloadCompanionAttachment,
  receiveCompanionAttachment,
} from '../../../../apps/desktop/src/companion-attachments.ts'
import {
  COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES,
  buildCompanionAttachmentOffer,
  sealCompanionAttachment as mobileSeal,
} from '../../../../apps/mobile/src/companion-attachment.ts'

interface RegisteredRoute {
  kind: 'exact'
  path: string
  handler(req: IncomingMessage, res: ServerResponse): Promise<void>
}

const closeServers: Array<() => Promise<void>> = []
afterEach(async () => { await Promise.all(closeServers.splice(0).map(close => close())) })

const pairingA = parsePersonalPairingId('pairing-a')
const pairingKey = crypto.getRandomValues(new Uint8Array(32))
const PLAINTEXT = 'attachment plaintext for session submission'

describe('Remote attachment HTTP assembled transfer', () => {
  it('moves one encrypted attachment end to end while Platform retains only ciphertext and metadata', async () => {
    const { origin, store, responses } = await start()
    const plaintext = new TextEncoder().encode(PLAINTEXT)

    const sealed = await mobileSeal(pairingKey, plaintext)
    expect(sealed.ciphertext).not.toEqual(plaintext)
    const upload = await fetch(`${origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: sealed.ciphertext,
    })
    expect(upload.status).toBe(201)
    const grant = await upload.json() as Record<string, unknown>
    expect(Object.keys(grant).sort()).toEqual(['byteLength', 'capability', 'expiresAt'])

    const [retained] = store.observe()
    if (retained === undefined) throw new Error('uploaded blob was not retained')
    expect(containsBytes(retained.ciphertext, plaintext)).toBe(false)
    expect(retained.pairingId).toBe(pairingA)

    const offer = buildCompanionAttachmentOffer({
      capability: grant.capability as never,
      ciphertextSha256: sealed.ciphertextSha256,
      byteLength: grant.byteLength as number,
      expiresAt: grant.expiresAt as number,
      fileName: 'notes.txt',
    }, 'operation-one' as never, 'session-one' as never)

    const submitted: Array<{ fileName: string; plaintext: Uint8Array }> = []
    const received = await receiveCompanionAttachment(offer, {
      pairingId: pairingA,
      pairingKey,
      now: (grant.expiresAt as number) - 1,
      download: async current => await downloadCompanionAttachment(current, {
        pairingId: pairingA,
        origin,
        headers: { 'x-test-pairing': 'pairing-a' },
      }),
      submit: async (attachment) => { submitted.push(attachment) },
    })
    expect(received).toEqual({ fileName: 'notes.txt', byteLength: plaintext.byteLength })
    expect(submitted[0]?.plaintext).toEqual(plaintext)
    expect(store.observe()).toHaveLength(0)
    for (const served of responses) {
      expect(containsBytes(served, plaintext)).toBe(false)
    }
  })

  it('fails explicitly on cross-pairing consume, hash mismatch, interruption, expiry, and limit violations', async () => {
    const { origin } = await start()
    const sealed = await mobileSeal(pairingKey, new TextEncoder().encode('second transfer'))

    const upload = await fetch(`${origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: sealed.ciphertext,
    })
    const grant = await upload.json() as { capability: string; byteLength: number; expiresAt: number }
    const offer = buildCompanionAttachmentOffer({
      capability: grant.capability as never,
      ciphertextSha256: sealed.ciphertextSha256,
      byteLength: grant.byteLength,
      expiresAt: grant.expiresAt,
      fileName: 'notes.txt',
    }, 'operation-two' as never, 'session-one' as never)

    const crossPairing = await fetch(`${origin}/v1/remote-attachments/consume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-pairing': 'pairing-b' },
      body: JSON.stringify({ capability: grant.capability }),
    })
    expect(crossPairing.status).toBe(403)
    expect(await errorBody(crossPairing)).toMatchObject({ code: 'ATTACHMENT_PAIRING_MISMATCH' })

    await expect(receiveCompanionAttachment({ ...offer, ciphertextSha256: '0'.repeat(64) }, {
      pairingId: pairingA,
      pairingKey,
      now: grant.expiresAt - 1,
      download: async () => sealed.ciphertext,
      submit: () => { throw new Error('hash mismatch must never submit') },
    })).rejects.toMatchObject({ reason: 'hash-mismatch' })

    await expect(receiveCompanionAttachment(offer, {
      pairingId: pairingA,
      pairingKey,
      now: grant.expiresAt - 1,
      download: () => Promise.reject(new Error('socket hang up')),
      submit: () => { throw new Error('interrupted transfer must never submit') },
    })).rejects.toMatchObject({ reason: 'transfer-interrupted' })

    await expect(receiveCompanionAttachment(offer, {
      pairingId: pairingA,
      pairingKey,
      now: grant.expiresAt,
      download: async () => sealed.ciphertext,
      submit: () => { throw new Error('expired capability must never submit') },
    })).rejects.toMatchObject({ reason: 'expired' })

    const oversized = await fetch(`${origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: new Uint8Array(16 * 1_024 * 1_024 + 1),
    })
    expect(oversized.status).toBe(413)
    expect(await errorBody(oversized)).toMatchObject({ code: 'ATTACHMENT_LIMIT_EXCEEDED' })

    const empty = await fetch(`${origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: new Uint8Array(0),
    })
    expect(empty.status).toBe(400)
    expect(await errorBody(empty)).toMatchObject({ code: 'ATTACHMENT_EMPTY' })

    const unknown = await fetch(`${origin}/v1/remote-attachments/consume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-pairing': 'pairing-a' },
      body: JSON.stringify({ capability: 'A'.repeat(43) }),
    })
    expect(unknown.status).toBe(404)
    expect(await errorBody(unknown)).toMatchObject({ code: 'ATTACHMENT_CAPABILITY_INVALID' })
  })

  it('removes the blob and capability after revocation before any consume', async () => {
    const { origin, store } = await start()
    const sealed = await mobileSeal(pairingKey, Uint8Array.of(1, 2, 3))
    const upload = await fetch(`${origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: sealed.ciphertext,
    })
    const grant = await upload.json() as { capability: string }
    const revoked = await fetch(`${origin}/v1/remote-attachments/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-pairing': 'pairing-a' },
      body: JSON.stringify({ capability: grant.capability }),
    })
    expect(revoked.status).toBe(204)
    expect(store.observe()).toHaveLength(0)
    const consume = await fetch(`${origin}/v1/remote-attachments/consume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-pairing': 'pairing-a' },
      body: JSON.stringify({ capability: grant.capability }),
    })
    expect(consume.status).toBe(404)
  })

  it('rejects cross-pairing revocation without deleting the blob', async () => {
    const { origin, store } = await start()
    const sealed = await mobileSeal(pairingKey, Uint8Array.of(1, 2, 3))
    const upload = await fetch(`${origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: sealed.ciphertext,
    })
    const grant = await upload.json() as { capability: string }
    const cross = await fetch(`${origin}/v1/remote-attachments/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-pairing': 'pairing-b' },
      body: JSON.stringify({ capability: grant.capability }),
    })
    expect(cross.status).toBe(403)
    expect(await errorBody(cross)).toMatchObject({ code: 'ATTACHMENT_PAIRING_MISMATCH' })
    expect(store.observe()).toHaveLength(1)
  })

  it('accepts plaintext that seals to the ciphertext ceiling and rejects one extra byte before encrypting', async () => {
    const limit = 64
    const { origin } = await start({ store: { maxBlobBytes: limit } })
    const accepted = await mobileSeal(pairingKey, new Uint8Array(limit - COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES), limit)
    expect(accepted.ciphertext.byteLength).toBe(limit)
    const upload = await fetch(`${origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: accepted.ciphertext,
    })
    expect(upload.status).toBe(201)
    await expect(mobileSeal(pairingKey, new Uint8Array(limit - COMPANION_ATTACHMENT_SEAL_OVERHEAD_BYTES + 1), limit))
      .rejects.toThrow('ciphertext blob ceiling')
  })

  it('keeps the blob when consume fails mid-write so a second consume succeeds', async () => {
    const { routes, store } = await start()
    const sealed = await mobileSeal(pairingKey, Uint8Array.of(9, 8, 7))
    const uploadRoute = routes.get('/v1/remote-attachments')
    if (uploadRoute === undefined) throw new Error('upload route was not registered')
    const uploadResponse = stubResponse()
    await uploadRoute.handler(
      streamingRequest({ 'x-test-pairing': 'pairing-a' }, [new Uint8Array(sealed.ciphertext)]),
      uploadResponse.res,
    )
    const grant = JSON.parse(new TextDecoder().decode(concatBytes(uploadResponse.body))) as { capability: string }
    const consumeRoute = routes.get('/v1/remote-attachments/consume')
    if (consumeRoute === undefined) throw new Error('consume route was not registered')
    await consumeRoute.handler(
      streamingRequest(
        { 'x-test-pairing': 'pairing-a' },
        [new TextEncoder().encode(JSON.stringify({ capability: grant.capability }))],
      ),
      failingResponse('mid-write failure').res,
    )
    expect(store.observe()).toHaveLength(1)
    await consumeRoute.handler(
      streamingRequest(
        { 'x-test-pairing': 'pairing-a' },
        [new TextEncoder().encode(JSON.stringify({ capability: grant.capability }))],
      ),
      failingResponse(new Error('mid-write failure')).res,
    )
    expect(store.observe()).toHaveLength(1)
    const retry = stubResponse()
    await consumeRoute.handler(
      streamingRequest(
        { 'x-test-pairing': 'pairing-a' },
        [new TextEncoder().encode(JSON.stringify({ capability: grant.capability }))],
      ),
      retry.res,
    )
    expect(retry.status).toBe(200)
    expect(concatBytes(retry.body)).toEqual(sealed.ciphertext)
    expect(store.observe()).toHaveLength(0)
  })

  it('leaves a finished consume body intact when delete-after-finish fails, so a later consume still delivers the blob', async () => {
    const { routes, store } = await start()
    const sealed = await mobileSeal(pairingKey, Uint8Array.of(4, 5, 6))
    const uploadRoute = routes.get('/v1/remote-attachments')
    if (uploadRoute === undefined) throw new Error('upload route was not registered')
    const uploadResponse = stubResponse()
    await uploadRoute.handler(
      streamingRequest({ 'x-test-pairing': 'pairing-a' }, [new Uint8Array(sealed.ciphertext)]),
      uploadResponse.res,
    )
    const grant = JSON.parse(new TextDecoder().decode(concatBytes(uploadResponse.body))) as { capability: string }
    const consumeRoute = routes.get('/v1/remote-attachments/consume')
    if (consumeRoute === undefined) throw new Error('consume route was not registered')
    vi.spyOn(store, 'revoke').mockRejectedValueOnce(new Error('delete after finish failed'))
    const first = stubResponse()
    await consumeRoute.handler(
      streamingRequest(
        { 'x-test-pairing': 'pairing-a' },
        [new TextEncoder().encode(JSON.stringify({ capability: grant.capability }))],
      ),
      first.res,
    )
    expect(first.status).toBe(200)
    expect(concatBytes(first.body)).toEqual(sealed.ciphertext)
    expect(store.observe()).toHaveLength(1)
    const retry = stubResponse()
    await consumeRoute.handler(
      streamingRequest(
        { 'x-test-pairing': 'pairing-a' },
        [new TextEncoder().encode(JSON.stringify({ capability: grant.capability }))],
      ),
      retry.res,
    )
    expect(retry.status).toBe(200)
    expect(concatBytes(retry.body)).toEqual(sealed.ciphertext)
    expect(store.observe()).toHaveLength(0)
  })

  it('keeps a foreign pairing key unable to open another pairing seal', async () => {
    const key = await deriveCompanionAttachmentKey(pairingKey)
    const sealed = await sealCompanionAttachment(key, new TextEncoder().encode('pairing secret'))
    await expect(openCompanionAttachment(
      await deriveCompanionAttachmentKey(crypto.getRandomValues(new Uint8Array(32))),
      sealed.ciphertext,
    )).rejects.toThrow()
  })

  it('answers CORS preflight and rejects untrusted origins and wrong methods on every route', async () => {
    const { origin } = await start()
    const paths = ['/v1/remote-attachments', '/v1/remote-attachments/consume', '/v1/remote-attachments/revoke']
    for (const path of paths) {
      const preflight = await fetch(`${origin}${path}`, {
        method: 'OPTIONS',
        headers: { origin: 'https://mobile.example' },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe('https://mobile.example')
      const get = await fetch(`${origin}${path}`, { method: 'GET' })
      expect(get.status).toBe(405)
      expect(await errorBody(get)).toMatchObject({ code: 'METHOD_NOT_ALLOWED' })
      const denied = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'x-test-pairing': 'pairing-a' },
      })
      expect(denied.status).toBe(403)
      expect(await errorBody(denied)).toMatchObject({ code: 'ORIGIN_DENIED' })
      const malformed = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { origin: 'not a url', 'x-test-pairing': 'pairing-a' },
      })
      expect(malformed.status).toBe(403)
    }
    const trusted = await fetch(`${origin}/v1/remote-attachments/revoke`, {
      method: 'POST',
      headers: {
        origin: 'https://mobile.example',
        'content-type': 'application/json',
        'x-test-pairing': 'pairing-a',
      },
      body: JSON.stringify({ capability: 'A'.repeat(43) }),
    })
    expect(trusted.status).toBe(204)
    expect(trusted.headers.get('access-control-allow-origin')).toBe('https://mobile.example')
  })

  it('rejects malformed, non-object, and oversized JSON bodies and non-canonical capabilities', async () => {
    const { origin } = await start()
    const headers = { 'content-type': 'application/json', 'x-test-pairing': 'pairing-a' }
    const consume = async (body: string): Promise<Response> =>
      await fetch(`${origin}/v1/remote-attachments/consume`, { method: 'POST', headers, body })
    expect((await consume('not json')).status).toBe(400)
    expect((await consume('[1,2]')).status).toBe(400)
    expect((await consume(JSON.stringify({ capability: 7 }))).status).toBe(400)
    const nonCanonical = await consume(JSON.stringify({ capability: `${'A'.repeat(42)}B` }))
    expect(nonCanonical.status).toBe(400)
    expect(await errorBody(nonCanonical)).toMatchObject({ code: 'BODY_INVALID' })
    const oversized = await consume(JSON.stringify({ capability: 'A'.repeat(43), padding: 'x'.repeat(8 * 1_024) }))
    expect(oversized.status).toBe(413)
    expect(await errorBody(oversized)).toMatchObject({ code: 'BODY_TOO_LARGE' })
  })

  it('maps expiry, capacity, and unexpected failures to explicit HTTP statuses', async () => {
    const shortLived = await start({ store: { capabilityLifetimeMs: 1 } })
    const sealed = await mobileSeal(pairingKey, Uint8Array.of(1, 2, 3))
    const upload = await fetch(`${shortLived.origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: sealed.ciphertext,
    })
    const grant = await upload.json() as { capability: string }
    await new Promise(resolve => setTimeout(resolve, 5))
    const expired = await fetch(`${shortLived.origin}/v1/remote-attachments/consume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-pairing': 'pairing-a' },
      body: JSON.stringify({ capability: grant.capability }),
    })
    expect(expired.status).toBe(410)
    expect(await errorBody(expired)).toMatchObject({ code: 'ATTACHMENT_EXPIRED' })

    const crowded = await start({ store: { maxRetainedBlobs: 1 } })
    const first = await mobileSeal(pairingKey, Uint8Array.of(1))
    await fetch(`${crowded.origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: first.ciphertext,
    })
    const second = await mobileSeal(pairingKey, Uint8Array.of(2))
    const overCapacity = await fetch(`${crowded.origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'pairing-a' },
      body: second.ciphertext,
    })
    expect(overCapacity.status).toBe(503)
    expect(await errorBody(overCapacity)).toMatchObject({ code: 'ATTACHMENT_CAPACITY' })

    const exploded = await fetch(`${crowded.origin}/v1/remote-attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-test-pairing': 'explode' },
      body: second.ciphertext,
    })
    expect(exploded.status).toBe(500)
    expect(await errorBody(exploded)).toMatchObject({ code: 'INTERNAL_ERROR' })
  })

  it('accepts non-Buffer stream chunks at the HTTP boundary', async () => {
    const { routes } = await start()
    const sealed = await mobileSeal(pairingKey, new TextEncoder().encode('streamed plaintext'))
    const uploadRoute = routes.get('/v1/remote-attachments')
    if (uploadRoute === undefined) throw new Error('upload route was not registered')
    const uploadResponse = stubResponse()
    await uploadRoute.handler(
      streamingRequest({ 'x-test-pairing': 'pairing-a' }, [new Uint8Array(sealed.ciphertext)]),
      uploadResponse.res,
    )
    expect(uploadResponse.status).toBe(201)
    const grant = JSON.parse(new TextDecoder().decode(concatBytes(uploadResponse.body))) as { capability: string }

    const consumeRoute = routes.get('/v1/remote-attachments/consume')
    if (consumeRoute === undefined) throw new Error('consume route was not registered')
    const consumeResponse = stubResponse()
    await consumeRoute.handler(
      streamingRequest(
        { 'x-test-pairing': 'pairing-a' },
        [new TextEncoder().encode(JSON.stringify({ capability: grant.capability }))],
      ),
      consumeResponse.res,
    )
    expect(consumeResponse.status).toBe(200)
    expect(concatBytes(consumeResponse.body)).toEqual(sealed.ciphertext)
  })

  it('bounds an upload stream without a trusted content-length inside the loop', async () => {
    const { routes } = await start({ store: { maxBlobBytes: 8 } })
    const uploadRoute = routes.get('/v1/remote-attachments')
    if (uploadRoute === undefined) throw new Error('upload route was not registered')
    const response = stubResponse()
    await uploadRoute.handler(
      streamingRequest({ 'x-test-pairing': 'pairing-a' }, [new Uint8Array(4), new Uint8Array(6)]),
      response.res,
    )
    expect(response.status).toBe(413)
  })

  it('fails loud when the configured browser origin is not a URL', () => {
    expect(() => { apply({} as Context, { origin: 'not a URL' }) }).toThrow()
  })
})

async function errorBody(response: Response): Promise<{ code: string }> {
  const body = await response.json() as { error: { code: string } }
  return body.error
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let start = 0; start + needle.byteLength <= haystack.byteLength; start += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) continue outer
    }
    return true
  }
  return false
}

function streamingRequest(headers: Record<string, string>, chunks: Uint8Array[]): IncomingMessage {
  return {
    headers,
    method: 'POST',
    async * [Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  } as unknown as IncomingMessage
}

function stubResponse(): { res: ServerResponse; status: number; body: Uint8Array[] } {
  const holder: { res: ServerResponse; status: number; body: Uint8Array[] } = {
    status: 0,
    body: [],
    res: undefined as never,
  }
  const state = { headersSent: false, writableFinished: false }
  const emitter = new EventEmitter()
  Object.assign(emitter, {
    writeHead(status: number) {
      holder.status = status
      state.headersSent = true
      return emitter
    },
    setHeader() { return emitter },
    end(chunk?: unknown) {
      if (typeof chunk === 'string') holder.body.push(new TextEncoder().encode(chunk))
      else if (chunk instanceof Uint8Array) holder.body.push(chunk)
      state.writableFinished = true
      queueMicrotask(() => { emitter.emit('finish') })
      return emitter
    },
  })
  Object.defineProperty(emitter, 'headersSent', { get() { return state.headersSent } })
  Object.defineProperty(emitter, 'writableFinished', { get() { return state.writableFinished } })
  holder.res = emitter as unknown as ServerResponse
  return holder
}

function failingResponse(failure: unknown = new Error('mid-write failure')): { res: ServerResponse } {
  const state = { headersSent: false, ended: false }
  const emitter = new EventEmitter()
  Object.assign(emitter, {
    writableFinished: false,
    writeHead() {
      state.headersSent = true
      return emitter
    },
    setHeader() { return emitter },
    end() {
      if (state.ended) return emitter
      state.ended = true
      throw failure
    },
  })
  Object.defineProperty(emitter, 'headersSent', { get() { return state.headersSent } })
  return { res: emitter as unknown as ServerResponse }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

async function start(options: { store?: Partial<RemoteAttachmentStoreOptions> } = {}): Promise<{
  origin: string
  store: RemoteAttachmentStoreProvider
  responses: Uint8Array[]
  routes: Map<string, RegisteredRoute>
}> {
  const routes = new Map<string, RegisteredRoute>()
  const responses: Uint8Array[] = []
  const ctx = new Context()
  const store = new RemoteAttachmentStoreProvider(ctx, {
    maxBlobBytes: 16 * 1_024 * 1_024,
    maxRetainedBlobs: 16,
    sweepIntervalMs: 60_000,
    schedule: () => ({ unref: vi.fn(), cancel: vi.fn() }),
    ...options.store,
  })
  const fake = {
    remoteAttachments: store,
    remoteAttachmentAuthority: {
      authenticate: async ({ headers }: { headers: IncomingMessage['headers'] }) => {
        const value = headers['x-test-pairing'] ?? headers['x-gestalt-pairing-id']
        if (typeof value !== 'string') throw new Error('pairing header is required')
        if (value === 'explode') throw new Error('authority exploded')
        return parsePersonalPairingId(value)
      },
    },
    webServer: {
      register(route: RegisteredRoute) {
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    },
    effect(register: () => () => void) { register() },
  } as unknown as Context
  apply(fake, { origin: 'https://mobile.example' })
  const http = createServer((req, res) => {
    const route = routes.get(new URL(req.url ?? '/', 'http://localhost').pathname)
    if (route === undefined) { res.writeHead(404).end(); return }
    const originalWrite = res.write.bind(res) as (chunk: unknown, ...rest: unknown[]) => boolean
    const originalEnd = res.end.bind(res) as (chunk?: unknown, ...rest: unknown[]) => unknown
    const capture = (chunk: unknown): void => {
      if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) responses.push(new Uint8Array(chunk))
    }
    res.write = (chunk: unknown, ...rest: unknown[]) => {
      capture(chunk)
      return originalWrite(chunk, ...rest)
    }
    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      capture(chunk)
      return originalEnd(chunk, ...rest)
    }) as unknown as typeof res.end
    void route.handler(req, res)
  })
  await new Promise<void>((resolve) => { http.listen(0, '127.0.0.1', resolve) })
  const address = http.address()
  if (address === null || typeof address === 'string') throw new Error('Remote Attachments test server did not bind')
  closeServers.push(async () => {
    await new Promise<void>((resolve, reject) => {
      http.close((error) => { if (error === undefined) resolve(); else reject(error) })
    })
    store.dispose()
  })
  return { origin: `http://127.0.0.1:${String(address.port)}`, store, responses, routes }
}
