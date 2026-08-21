import { describe, expect, it } from 'vitest'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import { createLocalStoragePairingSessionStore } from '../src/pairing-session-store.ts'

describe('LocalStorage pairing session store', () => {
  it('saves, loads, and clears one Account grant and drops a corrupt row', () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
      removeItem: (key: string) => { memory.delete(key) },
    }
    const store = createLocalStoragePairingSessionStore('gestalt-local-companion-development', storage)
    const grant = {
      endpoint: 'mobile' as const,
      routeId: parseRelayRouteId('mobile-route'),
      credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'),
      revision: 3,
    }
    const accountId = 'account-mobile' as never
    expect(store.load(accountId)).toBeUndefined()
    store.save(accountId, grant)
    expect(store.load(accountId)).toEqual(grant)
    store.clear(accountId)
    expect(store.load(accountId)).toBeUndefined()

    storage.setItem('deepseek-gestalt:gestalt-local-companion-development:mobile-pairing-grant:account-mobile', '{')
    expect(store.load(accountId)).toBeUndefined()
    expect(memory.size).toBe(0)
  })
})
