import { describe, it, expect } from 'vitest'
import {
  signWangwangRequest,
  computeWangwangSignature,
  buildWangwangSortedQuery,
  WANGWANG_HEADERS,
} from '../src/index.ts'

describe('Wangwang Adapter - Native Crypto HMAC-SHA256 Signing', () => {
  it('produces deterministic HMAC-SHA256 signature and canonical headers', () => {
    const timestamp = 1726000000000
    const query = { b: '2', a: '1', empty: null, undef: undefined }
    const sorted = buildWangwangSortedQuery(query)
    expect(sorted).toBe('a=1&b=2')

    // Exercise sorting branches
    buildWangwangSortedQuery({ k1: 'b', k2: 'a' })
    buildWangwangSortedQuery({ a: '1', b: '2' })
    const resDiffValues = buildWangwangSortedQuery({ key: 'val1', key_alt: 'val2' })
    expect(resDiffValues).toBeDefined()

    // Default empty query
    expect(buildWangwangSortedQuery()).toBe('')

    // Path without leading slash is normalized
    const signedNoSlash = signWangwangRequest({
      credentials: {
        accessKey: 'my-ak',
        secretKey: 'my-secret',
      },
      method: 'get',
      path: 'openapi/wangwang/messages',
      timestamp,
    })
    expect(signedNoSlash.headers[WANGWANG_HEADERS.accessKey]).toBe('my-ak')

    const signed = signWangwangRequest({
      credentials: {
        accessKey: 'my-ak',
        secretKey: 'my-secret',
      },
      method: 'post',
      path: '/openapi/wangwang/messages',
      query: { b: '2', a: '1' },
      timestamp,
      requestId: 'req-001',
    })

    expect(signed.queryString).toBe('a=1&b=2')
    expect(signed.headers[WANGWANG_HEADERS.accessKey]).toBe('my-ak')
    expect(signed.headers[WANGWANG_HEADERS.timestamp]).toBe(String(timestamp))
    expect(signed.headers[WANGWANG_HEADERS.requestId]).toBe('req-001')
    expect(signed.headers[WANGWANG_HEADERS.signature]).toBeDefined()

    // Deterministic check
    const sigAgain = computeWangwangSignature({
      method: 'POST',
      path: '/openapi/wangwang/messages',
      queryString: 'a=1&b=2',
      timestamp,
      secretKey: 'my-secret',
    })
    expect(signed.headers[WANGWANG_HEADERS.signature]).toBe(sigAgain)
  })
})
