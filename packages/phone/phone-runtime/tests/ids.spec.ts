import { describe, expect, expectTypeOf, it } from 'vitest'
import { deviceId, phoneCaptureId } from '../src/ids.ts'
import type { DeviceId, PhoneCaptureId } from '../src/types.ts'

describe('phone runtime identity constructors', () => {
  it('preserves upstream identity text under the final brands', () => {
    const device = deviceId('emulator-5554')
    const capture = phoneCaptureId('capture-1')
    expect(device).toBe('emulator-5554')
    expect(capture).toBe('capture-1')
    expectTypeOf(device).toEqualTypeOf<DeviceId>()
    expectTypeOf(capture).toEqualTypeOf<PhoneCaptureId>()
  })

  it('refuses an empty capture identity before branding', () => {
    expect(() => phoneCaptureId('')).toThrow('phone capture id must not be empty')
  })
})
