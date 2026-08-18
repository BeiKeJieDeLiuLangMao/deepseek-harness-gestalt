import { describe, expect, it, vi } from 'vitest'
import { DevelopmentKeylessMobileHandshakeClient } from '../src/development-keyless-pairing.ts'

describe('DevelopmentKeylessMobileHandshakeClient', () => {
  it('provides explicit keyless handshake bytes and opens a product-delivered Relay grant', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
    const client = new DevelopmentKeylessMobileHandshakeClient()

    await expect(client.begin('https://platform.example/pair')).resolves.toEqual({
      completionId: 'development-00000000-0000-4000-8000-000000000001',
      mobileHandshake: Uint8Array.of(0),
    })
    await expect(client.acceptDesktopHandshake(Uint8Array.of(1))).resolves.toBeUndefined()
    await expect(client.openRelayAuthority(new TextEncoder().encode(JSON.stringify({
      endpoint: 'mobile',
      routeId: 'route-mobile',
      credential: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      revision: 2,
    })))).resolves.toEqual({
      endpoint: 'mobile',
      routeId: 'route-mobile',
      credential: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      revision: 2,
    })
  })

  it.each([
    ['null', 'must be an object'],
    ['[]', 'must be an object'],
    ['{}', 'endpoint must be mobile'],
    ['{"endpoint":"desktop","revision":1}', 'endpoint must be mobile'],
    ['{"endpoint":"mobile"}', 'revision must be positive'],
    ['{"endpoint":"mobile","revision":0}', 'revision must be positive'],
    ['{"endpoint":"mobile","revision":1,"routeId":"","credential":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"}', 'routeId must be'],
    ['{"endpoint":"mobile","revision":1,"routeId":"route","credential":"short"}', 'Relay credential'],
  ])('rejects malformed development authority %s', async (encoded, message) => {
    const client = new DevelopmentKeylessMobileHandshakeClient()
    await expect(client.openRelayAuthority(new TextEncoder().encode(encoded))).rejects.toThrow(message)
  })
})
