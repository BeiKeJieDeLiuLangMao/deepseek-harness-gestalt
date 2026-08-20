/** Mobile retention of keyless Personal Pairing key material. */

import type { PersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import type { MobilePairingKeyRetention } from './personal-pairing.ts'

/** Maximum Personal Pairings whose key material one Mobile installation retains. */
export const MAX_RETAINED_PAIRING_KEYS = 16

/** Retained independent pairing keys for confirmed Personal Pairings. */
export class PairingCompanionKeyVault implements MobilePairingKeyRetention {
  private readonly materials = new Map<string, Uint8Array>()

  /**
   * Retain the independent key material of one confirmed Personal Pairing.
   * @param pairingId - confirmed Personal Pairing identity.
   * @param material - at least 32 bytes of pairing key material; stored as a copy.
   */
  retain(pairingId: PersonalPairingId, material: Uint8Array): void {
    if (material.byteLength < 32) throw new TypeError('Personal Pairing key material must contain at least 256 bits')
    if (!this.materials.has(pairingId) && this.materials.size >= MAX_RETAINED_PAIRING_KEYS) {
      throw new Error('Mobile retained Personal Pairing key limit reached')
    }
    const previous = this.materials.get(pairingId)
    previous?.fill(0)
    this.materials.set(pairingId, material.slice())
  }

  /**
   * Read one retained pairing key.
   * @param pairingId - confirmed Personal Pairing identity.
   * @returns copy of the retained key material, or undefined when absent.
   */
  pairingKeyMaterial(pairingId: PersonalPairingId): Uint8Array | undefined {
    return this.materials.get(pairingId)?.slice()
  }

  /** @param pairingId - confirmed Personal Pairing whose material is released and zeroed. */
  release(pairingId: PersonalPairingId): void {
    const material = this.materials.get(pairingId)
    if (material === undefined) return
    material.fill(0)
    this.materials.delete(pairingId)
  }

  /** Zero every retained pairing key, leaving the vault empty. */
  wipe(): void {
    for (const material of this.materials.values()) material.fill(0)
    this.materials.clear()
  }
}
