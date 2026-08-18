import { describe, expect, it, vi } from 'vitest'
import { disposeDesktopOwners } from '../src/shutdown.ts'

describe('disposeDesktopOwners', () => {
  it('awaits both owners and aggregates every shutdown failure', async () => {
    const account = { dispose: vi.fn(async () => { throw new Error('account disposal failed') }) }
    const pairing = { dispose: vi.fn(async () => { throw new Error('pairing disposal failed') }) }

    await expect(disposeDesktopOwners(account, pairing)).rejects.toMatchObject({
      errors: [
        expect.objectContaining({ message: 'account disposal failed' }),
        expect.objectContaining({ message: 'pairing disposal failed' }),
      ],
    })
    expect(account.dispose).toHaveBeenCalledOnce()
    expect(pairing.dispose).toHaveBeenCalledOnce()
  })
})
