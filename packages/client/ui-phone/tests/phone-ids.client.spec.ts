import { describe, expect, expectTypeOf, it } from 'vitest'
import type { DeviceId, PhoneCaptureId } from '@deepseek-ai/dsh-phone-runtime'
import { phoneCaptureIdOf } from '../src/client/phone-capture-id.ts'
import { phoneDeviceIdOf } from '../src/client/phone-device-id.ts'

describe('phone browser identity constructors', () => {
  it('preserves validated identity text under the final brands', () => {
    const capture = phoneCaptureIdOf('capture-1')
    const device = phoneDeviceIdOf('emulator-5554')
    expect(capture).toBe('capture-1')
    expect(device).toBe('emulator-5554')
    expectTypeOf(capture).toEqualTypeOf<PhoneCaptureId>()
    expectTypeOf(device).toEqualTypeOf<DeviceId>()
  })

  it('refuses empty identities before branding', () => {
    expect(() => phoneCaptureIdOf('')).toThrow('phone capture id must not be empty')
    expect(() => phoneDeviceIdOf('')).toThrow('phone device id must not be empty')
  })
})
