import { describe, expect, it } from 'vitest'
import { MemoryPlatformCapacityGate, retryAfterSecondsUntil } from '../src/open-registration-quotas.ts'

describe('open-registration quotas', () => {
  it('marks the shared watermark as shedding only after the last live slot is acquired', () => {
    expect(() => new MemoryPlatformCapacityGate(0, 1_000)).toThrow('maxAttachments')
    expect(() => new MemoryPlatformCapacityGate(1, 0)).toThrow('retryAfterMs')
    const gate = new MemoryPlatformCapacityGate(1, 4_500)
    expect(gate.shedding).toBe(false)
    expect(gate.tryAcquire()).toBe(true)
    expect(gate.shedding).toBe(true)
    expect(gate.tryAcquire()).toBe(false)
    expect(gate.retryAfterSeconds).toBe(5)
    gate.release()
    gate.release()
    expect(gate.shedding).toBe(false)
  })

  it('clamps exhausted quota windows to a one-second retry hint', () => {
    expect(retryAfterSecondsUntil(0, 1_000, 5_000)).toBe(1)
  })
})
