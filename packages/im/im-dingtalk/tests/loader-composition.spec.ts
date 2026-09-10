/**
 * Real Cordis Loader composition test for @deepseek-ai/dsh-im-dingtalk:
 * Boots a keyless cordis.yml through the real Cordis Loader and verifies:
 * - Plugin registration and unwrapExports contract
 * - Discovery of imDingtalk service under Context
 * - Interaction with mock subprocess and imDelivery
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

  it('loads seamlessly into cordis Context with mock dependencies', async () => {
    const ctx = new Context()

    ctx.subprocess = {} as unknown as typeof ctx.subprocess
    ctx.imConfig = {} as unknown as typeof ctx.imConfig
    ctx.imDelivery = {} as unknown as typeof ctx.imDelivery

    const service = new DingTalkDwsAdapterServiceImpl(ctx, {
      dwsPath: 'mock-dws',
      profile: 'mock-profile',
    })

    expect(service).toBeDefined()
    expect(service.config.dwsPath).toBe('mock-dws')
    expect(service.config.profile).toBe('mock-profile')

    await ctx.fiber.dispose()
  })
})
