import { describe, expect, it } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import { MAX_RETAINED_PAIRING_KEYS, PairingCompanionKeyVault } from '../src/companion-keys.ts'

const MATERIAL = Uint8Array.from({ length: 32 }, (_, index) => index + 3)
const OTHER = Uint8Array.from({ length: 32 }, (_, index) => 200 - index)

describe('PairingCompanionKeyVault', () => {
  it('retains a copy and zeroes released keys', () => {
    const vault = new PairingCompanionKeyVault()
    const pairing = parsePersonalPairingId('pairing-one')
    expect(() => { vault.retain(pairing, Uint8Array.of(1)) }).toThrow('256 bits')
    vault.retain(pairing, MATERIAL)
    const exported = vault.pairingKeyMaterial(pairing)
    expect(exported).toEqual(MATERIAL)
    expect(exported).not.toBe(MATERIAL)
    vault.retain(pairing, OTHER)
    expect(vault.pairingKeyMaterial(pairing)).toEqual(OTHER)
    vault.release(pairing)
    expect(vault.pairingKeyMaterial(pairing)).toBeUndefined()
    vault.release(pairing)
  })

  it('enforces the retained pairing-key ceiling and wipes every key', () => {
    const vault = new PairingCompanionKeyVault()
    for (let index = 0; index < MAX_RETAINED_PAIRING_KEYS; index += 1) {
      vault.retain(parsePersonalPairingId(`pairing-${String(index)}`), MATERIAL)
    }
    expect(() => { vault.retain(parsePersonalPairingId('pairing-extra'), MATERIAL) })
      .toThrow('key limit reached')
    const first = parsePersonalPairingId('pairing-0')
    vault.retain(first, OTHER)
    expect(vault.pairingKeyMaterial(first)).toEqual(OTHER)
    vault.wipe()
    expect(vault.pairingKeyMaterial(first)).toBeUndefined()
  })
})
