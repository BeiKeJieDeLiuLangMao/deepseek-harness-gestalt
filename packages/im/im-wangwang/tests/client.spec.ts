import { describe, it, expect } from 'vitest'
import { WangwangAmbiguousError, WangwangOpenApiClient } from '../src/index.ts'

const testCredentials = { accessKey: 'ak', secretKey: 'sk' }

function clientWith(fakeFetch: typeof fetch): WangwangOpenApiClient {
  return new WangwangOpenApiClient({
    endpoint: 'https://openapi.test.fliggy.com',
    fetch: fakeFetch,
  })
}

describe('Wangwang Adapter - OpenAPI Client & Ambiguous Error Handling', () => {
  it('handles pullEvents HTTP and API error branches', async () => {
    // HTTP error
    const client1 = clientWith(async (): Promise<Response> => new Response('Bad Request', { status: 400 }))
    await expect(client1.pullEvents({
      merchantId: 'm1',
      credentials: testCredentials,
    })).rejects.toThrow(/Wangwang pullEvents failed: HTTP 400/)

    // API level error via `message`
    const client2 = clientWith(async (): Promise<Response> => new Response(
      JSON.stringify({ code: 5001, message: 'Invalid token' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    await expect(client2.pullEvents({
      merchantId: 'm1',
      credentials: testCredentials,
    })).rejects.toThrow(/Wangwang pullEvents API error: Invalid token/)

    // API level error via `error` field
    const client3 = clientWith(async (): Promise<Response> => new Response(
      JSON.stringify({ code: 5002, error: 'Rate limited' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    await expect(client3.pullEvents({
      merchantId: 'm1',
      credentials: testCredentials,
    })).rejects.toThrow(/Wangwang pullEvents API error: Rate limited/)

    // API level error without any detail field
    const client4 = clientWith(async (): Promise<Response> => new Response(
      JSON.stringify({ code: -1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    await expect(client4.pullEvents({
      merchantId: 'm1',
      credentials: testCredentials,
    })).rejects.toThrow(/Wangwang pullEvents API error: unknown error/)
  })

  it('maps pullEvents success variants: success flag, status flag, missing data and cursor fallbacks', async () => {
    // `success: true` without a data wrapper: events at top level, event uses
    // `content` fallback, no msgTime, and no nextSinceId -> falls back to request sinceId.
    const client1 = clientWith(async (): Promise<Response> => new Response(JSON.stringify({
      success: true,
      events: [
        {
          eventId: 'e1',
          merchantId: 'm1',
          senderType: 1,
          messageId: 'msg-e1',
          customerId: 'c1',
          conversationId: 'conv-1',
          msgType: 1,
          content: 'legacy content field',
        },
      ],
      hasMore: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const page1 = await client1.pullEvents({
      merchantId: 'm1',
      credentials: testCredentials,
      sinceId: 77,
      waitSeconds: 5,
      requestId: 'req-pull-1',
    })
    expect(page1.events).toHaveLength(1)
    expect(page1.events[0]?.textContent).toBe('legacy content field')
    expect(page1.events[0]?.customerNick).toBeUndefined()
    expect(page1.events[0]?.attachments).toBeUndefined()
    expect(page1.nextSinceId).toBe(77)
    expect(page1.hasMore).toBe(true)

    // `status: 'success'` with a data wrapper whose events field is not an array,
    // and no nextSinceId anywhere -> cursor defaults to 0.
    const client2 = clientWith(async (): Promise<Response> => new Response(JSON.stringify({
      status: 'success',
      data: { events: 'not-an-array' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const page2 = await client2.pullEvents({
      merchantId: 'm1',
      credentials: testCredentials,
    })
    expect(page2.events).toHaveLength(0)
    expect(page2.nextSinceId).toBe(0)
    expect(page2.hasMore).toBe(false)
  })

  it('maps malformed event fields to safe defaults', async () => {
    const client = clientWith(async (): Promise<Response> => new Response(JSON.stringify({
      code: 0,
      data: {
        events: [
          {},
          { eventId: 9001, attachments: [{}] },
        ],
        nextSinceId: 9,
        hasMore: false,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const page = await client.pullEvents({
      merchantId: 'm1',
      credentials: testCredentials,
    })
    expect(page.events).toHaveLength(2)
    const empty = page.events[0]
    expect(empty?.eventId).toBe('')
    expect(empty?.merchantId).toBe('')
    expect(empty?.senderType).toBe(1)
    expect(empty?.messageId).toBe('')
    expect(empty?.customerId).toBe('')
    expect(empty?.conversationId).toBe('')
    expect(empty?.msgType).toBe(1)
    expect(empty?.textContent).toBe('')
    expect(page.events[1]?.eventId).toBe('9001')
    const att = page.events[1]?.attachments?.[0]
    expect(att?.mediaType).toBe('')
    expect(att?.mediaUrl).toBe('')
    expect(att?.label).toBeUndefined()
  })

  it('falls back to globalThis.fetch when no custom fetch is injected', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
      code: 0,
      data: { events: [], nextSinceId: 3, hasMore: false },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    try {
      const offlineClient = new WangwangOpenApiClient({ endpoint: 'https://openapi.test.fliggy.com' })
      const page = await offlineClient.pullEvents({ merchantId: 'm1', credentials: testCredentials })
      expect(page.nextSinceId).toBe(3)
    } finally {
      globalThis.fetch = original
    }
  })

  it('handles sendMessage network error and HTTP 5xx with structured WangwangAmbiguousError', async () => {
    // Network error during send
    const client1 = clientWith(async (): Promise<Response> => {
      throw new Error('ECONNRESET')
    })
    await expect(client1.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })).rejects.toThrow(/NETWORK_ERROR_DURING_SEND/)

    // Non-Error network failure is stringified into the same structured error
    const clientNonError = clientWith(async (): Promise<Response> => {
      throw 'plain-socket-failure'
    })
    await expect(clientNonError.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })).rejects.toThrow(/NETWORK_ERROR_DURING_SEND: plain-socket-failure/)

    // HTTP 502 Bad Gateway -> structured ambiguous error with httpStatus
    const client2 = clientWith(async (): Promise<Response> => new Response('Bad Gateway', { status: 502 }))
    const send2 = client2.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })
    await expect(send2).rejects.toThrow(/Wangwang sendMessage failed: HTTP 502/)
    await expect(send2).rejects.toBeInstanceOf(WangwangAmbiguousError)

    // Non-ambiguous HTTP 400 -> plain error (never retried as unknown)
    const client400 = clientWith(async (): Promise<Response> => new Response('Bad Request', { status: 400 }))
    await expect(client400.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })).rejects.toThrow(/Wangwang sendMessage failed: HTTP 400/)

    // API business error on 200
    const client3 = clientWith(async (): Promise<Response> => new Response(
      JSON.stringify({ code: -1, error: 'User banned' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    await expect(client3.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })).rejects.toThrow(/Wangwang sendMessage API error: User banned/)

    // API business error without any detail field
    const client4 = clientWith(async (): Promise<Response> => new Response(
      JSON.stringify({ code: -2 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    await expect(client4.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })).rejects.toThrow(/Wangwang sendMessage API error: unknown error/)

    // API business error via `message` field
    const client5 = clientWith(async (): Promise<Response> => new Response(
      JSON.stringify({ code: -3, message: 'Token expired' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    await expect(client5.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })).rejects.toThrow(/Wangwang sendMessage API error: Token expired/)
  })

  it('maps sendMessage success with and without the data wrapper', async () => {
    // Top-level receipt fields (no data wrapper)
    const client1 = clientWith(async (): Promise<Response> => new Response(
      JSON.stringify({ code: 0, messageId: 'm-top' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const res1 = await client1.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })
    expect(res1.messageId).toBe('m-top')
    expect(res1.producerId).toBeUndefined()

    // Data wrapper present but messageId absent -> empty string sentinel
    const client2 = clientWith(async (): Promise<Response> => new Response(
      JSON.stringify({ code: 0, data: {} }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const res2 = await client2.sendMessage({
      merchantId: 'm1',
      credentials: testCredentials,
      customerId: 'c1',
      content: 'hello',
      userId: 'u1',
      requestId: 'r1',
    })
    expect(res2.messageId).toBe('')
  })
})

describe('WangwangAmbiguousError', () => {
  it('carries structured ambiguity facts', () => {
    const bare = new WangwangAmbiguousError('bare')
    expect(bare.name).toBe('WangwangAmbiguousError')
    expect(bare.isAmbiguous).toBe(true)
    expect(bare.httpStatus).toBeUndefined()
    expect(bare.rawDetails).toBeUndefined()

    const cause = new Error('root')
    const full = new WangwangAmbiguousError('with-facts', { httpStatus: 503, rawDetails: 'upstream down', cause })
    expect(full.httpStatus).toBe(503)
    expect(full.rawDetails).toBe('upstream down')
    expect(full.cause).toBe(cause)
  })
})
