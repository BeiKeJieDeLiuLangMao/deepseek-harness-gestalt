/** Per-Paired-Desktop key vault retained by the Mobile Personal Pairing seam. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { PersonalPairingId } from '@deepseek-ai/dsh-remote-access'

/** Maximum Personal Pairings whose key material one Mobile installation retains. */
export const MAX_RETAINED_PAIRING_KEYS = 16

/** Opaque Paired Desktop identity injected by the Personal Pairing seam. */
export type CompanionDesktopId = Branded<'CompanionDesktopId'>

const DESKTOP_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Parse a Paired Desktop identity arriving from the Personal Pairing seam.
 * @param value - untrusted desktop identifier.
 * @returns branded Paired Desktop identity.
 */
export function parseCompanionDesktopId(value: unknown): CompanionDesktopId {
  if (typeof value !== 'string' || !DESKTOP_ID_PATTERN.test(value)) {
    throw new TypeError('Companion desktop id must be 1-128 base64url characters')
  }
  return value as CompanionDesktopId
}

/**
 * Project one confirmed Personal Pairing to its Paired Desktop identity.
 * @param pairingId - confirmed Personal Pairing identity.
 * @returns branded Paired Desktop identity naming the same pairing.
 */
export function companionDesktopIdOfPairing(pairingId: PersonalPairingId): CompanionDesktopId {
  return parseCompanionDesktopId(pairingId)
}

/** Per-desktop AES key source owned by the Personal Pairing seam. */
export interface CompanionCacheKeySource {
  /**
   * Supply the cache encryption key derived for one Paired Desktop.
   * @param desktopId - Paired Desktop identity.
   * @returns non-extractable AES-GCM cache key.
   */
  keyFor(desktopId: CompanionDesktopId): Promise<CryptoKey>
}

const COMPANION_CACHE_HKDF_INFO = 'gestalt-companion-cache-v1'

/** Retained independent pairing keys; each confirmed pairing scopes one derived cache key. */
export class PairingCompanionKeyVault implements CompanionCacheKeySource {
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
    this.materials.set(pairingId, material.slice())
  }

  /** @param desktopId - Paired Desktop identity owning the key. @returns non-extractable AES-GCM cache key. */
  async keyFor(desktopId: CompanionDesktopId): Promise<CryptoKey> {
    const material = this.materials.get(desktopId)
    if (material === undefined) throw new Error('No retained Personal Pairing key for this Paired Desktop')
    const hkdf = await crypto.subtle.importKey('raw', new Uint8Array(material), 'HKDF', false, ['deriveKey'])
    return await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(COMPANION_CACHE_HKDF_INFO),
      },
      hkdf,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
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
