import { describe, it, expect } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import {
  validateWangwangConfig,
  wangwangDomainSpec,
  wangwangChannelCursorRecordSchema,
  wangwangSentEchoRecordSchema,
  wangwangSentEchoKey,
  type WangwangAdapterConfig,
  type WangwangAdmittedMerchant,
} from '../src/index.ts'

describe('Wangwang Adapter - Config & Spec Validation', () => {
  it('validates a correct admitted merchant configuration', () => {
    const merchant: WangwangAdmittedMerchant = {
      merchantId: 'm_valid',
      accountId: brandString<ImAccountId>('acc-1'),
      displayName: 'Valid Store',
      accessKeyRef: credentialRef('AK_VAL'),
      secretKeyRef: credentialRef('SK_VAL'),
      mainServiceAccountId: 'kefu_main',
    }

    const config: WangwangAdapterConfig = {
      endpoint: 'https://openapi.test.fliggy.com',
      admittedMerchants: [merchant],
      timestampToleranceMs: 300_000,
      pollLimit: 50,
    }

    const validated = validateWangwangConfig(config)
    expect(validated.endpoint).toBe('https://openapi.test.fliggy.com')
    expect(validated.admittedMerchants).toHaveLength(1)
  })

  it('rejects invalid endpoint or empty admittedMerchants', () => {
    expect(() => {
      validateWangwangConfig({
        endpoint: 'invalid-url',
        admittedMerchants: [],
      })
    }).toThrow()
  })
})

describe('Wangwang Adapter - Durable Domain Specification', () => {
  it('declares the im_wangwang domain with channel_cursors and sent_echoes tables', () => {
    expect(wangwangDomainSpec.name).toBe('im_wangwang')
    expect(wangwangDomainSpec.version).toBe(1)
    expect(Object.keys(wangwangDomainSpec.tables).sort()).toEqual(['channel_cursors', 'sent_echoes'])
  })

  it('validates channel cursor records at the durable boundary', () => {
    const valid = wangwangChannelCursorRecordSchema.parse({
      merchantId: 'm1',
      sinceId: 42,
      updatedAt: new Date().toISOString(),
    })
    expect(valid.sinceId).toBe(42)

    expect(() => wangwangChannelCursorRecordSchema.parse({
      merchantId: 'm1',
      sinceId: -1,
      updatedAt: new Date().toISOString(),
    })).toThrow()
    expect(() => wangwangChannelCursorRecordSchema.parse({
      merchantId: 'm1',
      sinceId: 1,
      updatedAt: 'not-a-date',
    })).toThrow()
  })

  it('validates sent echo records and rejects unknown intents', () => {
    const valid = wangwangSentEchoRecordSchema.parse({
      messageId: 'msg-1',
      merchantId: 'm1',
      requestId: 'req-1',
      intent: 'ai',
      settledAt: new Date().toISOString(),
    })
    expect(valid.intent).toBe('ai')

    expect(() => wangwangSentEchoRecordSchema.parse({
      messageId: 'msg-1',
      merchantId: 'm1',
      requestId: 'req-1',
      intent: 'external',
      settledAt: new Date().toISOString(),
    })).toThrow()
  })

  it('scopes sent echo keys per merchant', () => {
    expect(wangwangSentEchoKey('m1', 'msg-9')).toBe('m1::msg-9')
    expect(wangwangSentEchoKey('m2', 'msg-9')).not.toBe(wangwangSentEchoKey('m1', 'msg-9'))
  })
})
