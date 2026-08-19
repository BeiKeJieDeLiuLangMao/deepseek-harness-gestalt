import { describe, expect, it } from 'vitest'
import {
  clearCompanionDesktopCache,
  companionMutationAllowed,
  openCompanionCache,
  recordCompanionTransmission,
  recoverCompanionOperation,
  sealCompanionCache,
} from '../src/companion-cache.ts'

describe('Companion Cache', () => {
  it('seals metadata/transcripts per Desktop and omits automatic attachment or credential cache', () => {
    const sealed = sealCompanionCache('desktop-a', JSON.stringify({ title: 'S', transcript: ['hi'] }))
    expect(sealed.desktopId).toBe('desktop-a')
    expect(openCompanionCache(sealed)).toContain('transcript')
    expect(sealed.ciphertext.includes('secret-token')).toBe(false)
  })

  it('allows cache reads offline but disables mutations until Remote Online', () => {
    expect(companionMutationAllowed(false, 'prompt')).toBe(false)
    expect(companionMutationAllowed(false, 'approval')).toBe(false)
    expect(companionMutationAllowed(true, 'prompt')).toBe(true)
  })

  it('stores receipts only after transmit and recovers without auto-replay', () => {
    const afterSend = recordCompanionTransmission(new Map(), 'op-1')
    expect(afterSend.get('op-1')?.status).toBe('unknown')
    expect(recoverCompanionOperation(afterSend, 'op-1', 'committed').get('op-1')?.status).toBe('committed')
    expect(recoverCompanionOperation(afterSend, 'op-1', 'absent').get('op-1')?.status).toBe('absent')
  })

  it('clears one Desktop cache without touching another', () => {
    const records = new Map([
      ['desktop-a', sealCompanionCache('desktop-a', 'a')],
      ['desktop-b', sealCompanionCache('desktop-b', 'b')],
    ])
    const cleared = clearCompanionDesktopCache(records, 'desktop-a')
    expect(cleared.has('desktop-a')).toBe(false)
    expect(openCompanionCache(cleared.get('desktop-b')!)).toBe('b')
  })
})
