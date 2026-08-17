import { describe, expect, it, vi } from 'vitest'
import { UnavailableDesktopPairingController } from '../src/personal-pairing.ts'

describe('UnavailableDesktopPairingController', () => {
  it('keeps every product verb fail-closed before independent Noise review', async () => {
    const controller = new UnavailableDesktopPairingController('independent review pending')
    const expected = {
      status: 'unavailable', enabled: false, pairings: [], error: 'independent review pending',
    }
    expect(controller.getSnapshot()).toEqual(expected)
    await expect(controller.setEnabled(true)).resolves.toEqual(expected)
    await expect(controller.createChallenge()).resolves.toEqual(expected)
    await expect(controller.cancelChallenge()).resolves.toEqual(expected)
    await expect(controller.confirm('pending-1')).resolves.toEqual(expected)
    await expect(controller.reject('pending-1')).resolves.toEqual(expected)
    const listener = vi.fn()
    controller.subscribe(listener)()
    expect(listener).not.toHaveBeenCalled()
    await expect(controller.dispose()).resolves.toBeUndefined()
  })
})
