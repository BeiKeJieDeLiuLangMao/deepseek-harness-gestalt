import { describe, expect, it } from 'vitest'
import {
  parseMobileAccountInstallationViews,
  parseMobileInstallationPresentation,
} from '@deepseek-ai/dsh-platform-account'

describe('parseMobileInstallationPresentation', () => {
  it('accepts a bounded device-owned iOS or Android presentation', () => {
    expect(parseMobileInstallationPresentation({
      name: 'Yishu mobile installation',
      platform: 'ios',
    })).toEqual({ name: 'Yishu mobile installation', platform: 'ios' })
    expect(parseMobileInstallationPresentation({
      name: 'Pixel work installation',
      platform: 'android',
    })).toEqual({ name: 'Pixel work installation', platform: 'android' })
  })

  it.each([
    [{ name: '', platform: 'ios' }, 'name'],
    [{ name: ' '.repeat(3), platform: 'android' }, 'name'],
    [{ name: 'x'.repeat(129), platform: 'ios' }, 'name'],
    [{ name: 'Browser', platform: 'web' }, 'platform'],
    [{ name: 'Browser' }, 'platform'],
  ])('rejects invalid Mobile Installation presentation %#', (value, field) => {
    expect(() => parseMobileInstallationPresentation(value)).toThrow(field)
  })
})

describe('parseMobileAccountInstallationViews', () => {
  it('accepts current and legacy Mobile Installation rows', () => {
    expect(parseMobileAccountInstallationViews([
      { id: 'current-mobile', reference: '123456789abc', name: 'Current phone', platform: 'ios' },
      { id: 'legacy-mobile', reference: 'abcdef123456' },
    ])).toEqual([
      { id: 'current-mobile', reference: '123456789abc', name: 'Current phone', platform: 'ios' },
      { id: 'legacy-mobile', reference: 'abcdef123456' },
    ])
  })

  it.each([
    [[{ id: 'mobile', reference: 1 }], 'reference'],
    [[{ id: 'mobile', reference: 'ABCDEF123456' }], 'reference'],
    [[{ id: 'mobile', reference: '123456789abc', name: 'Partial' }], 'present together'],
    [[{ id: 'mobile', reference: '123456789abc', platform: 'ios' }], 'present together'],
    [[
      { id: 'mobile', reference: '123456789abc' },
      { id: 'mobile', reference: 'abcdef123456' },
    ], 'unique'],
  ])('rejects invalid Mobile Installation rows %#', (value, message) => {
    expect(() => parseMobileAccountInstallationViews(value)).toThrow(message)
  })
})
