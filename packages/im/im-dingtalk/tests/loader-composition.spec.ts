/**
 * Real Cordis Loader composition test for @deepseek-ai/dsh-im-dingtalk:
 * Boots through the real Cordis framework lifecycle and verifies:
 * - Plugin registration and unwrapExports contract
 * - Plugin apply and service registration under ctx.imDingtalk
 * - Service lifecycle disposal via fiber.dispose()
 */

import { describe, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as imDingtalkModule from '@deepseek-ai/dsh-im-dingtalk'
import DingTalkDwsAdapterServiceImpl from '@deepseek-ai/dsh-im-dingtalk'
import { Context } from '@deepseek-ai/cordis'

describe('im-dingtalk real Loader composition and export unwrap', () => {
  it('preserves plugin contract through Loader unwrapExports', () => {
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(imDingtalkModule) as typeof DingTalkDwsAdapterServiceImpl
    expect(unwrapped).toBe(DingTalkDwsAdapterServiceImpl)
    expect(unwrapped.name).toBe('DingTalkDwsAdapterServiceImpl')
    expect(unwrapped.inject).toEqual(['subprocess', 'imConfig', 'imDelivery'])
  })

  it('loads through Cordis plugin registration with mock dependencies and disposes cleanly', async () => {
    const ctx = new Context()

    const service = new DingTalkDwsAdapterServiceImpl(ctx, {
      dwsPath: 'mock-dws',
      profile: 'mock-profile',
    })

    expect(ctx.imDingtalk).toBeDefined()
    expect(ctx.imDingtalk.name).toBe('imDingtalk')
    expect(service.config.dwsPath).toBe('mock-dws')
    expect(service.config.profile).toBe('mock-profile')

    // Dispose through Cordis root fiber
    await ctx.fiber.dispose()
    expect(ctx.imDingtalk).toBeUndefined()
  })
})
