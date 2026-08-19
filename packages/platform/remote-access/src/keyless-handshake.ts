/**
 * Explicit development-only keyless `PairingHandshakeProvider`.
 * Every value is a deterministic SHA-256 derivation of the invitation secret, so Desktop,
 * Mobile, and Platform agree on one 256-bit pairing key without product cryptography.
 * It provides no cryptographic security and is never selected by the production path.
 */

import type {
  ActivePairingKey,
  CompletedPairingHandshake,
  PairingChallengeState,
  PairingHandshakeChallenge,
  PairingHandshakeProvider,
  PendingPairingKey,
  PersonalPairingKeyReference,
} from './index.ts'
import type { RelayCredentialGrant } from './relay.ts'

const FINGERPRINT_DOMAIN = 'gestalt-keyless-fingerprint\0'
const MOBILE_HANDSHAKE_DOMAIN = 'gestalt-keyless-mobile-handshake\0'
const HANDSHAKE_HASH_DOMAIN = 'gestalt-keyless-handshake-hash\0'
const PAIRING_KEY_DOMAIN = 'gestalt-keyless-pairing-key\0'
const KEY_REFERENCE_DOMAIN = 'gestalt-keyless-key-reference\0'

/**
 * Derive the keyless Desktop fingerprint bound into one invitation.
 * @param invitationSecret - 256-bit invitation capability.
 * @returns stable human-readable fingerprint of 16 lowercase hex characters.
 */
export async function deriveKeylessDesktopFingerprint(invitationSecret: Uint8Array): Promise<string> {
  const digest = await digestKeyless(FINGERPRINT_DOMAIN, invitationSecret)
  return `keyless-${hex(digest, 8)}`
}

/**
 * Derive the Mobile handshake message both keyless halves expect.
 * @param invitationSecret - 256-bit invitation capability from the one-time link.
 * @returns deterministic 32-byte Mobile handshake message.
 */
export async function deriveKeylessMobileHandshake(invitationSecret: Uint8Array): Promise<Uint8Array> {
  return await digestKeyless(MOBILE_HANDSHAKE_DOMAIN, invitationSecret)
}

/**
 * Derive the handshake hash that produces matching authentication words.
 * @param invitationSecret - 256-bit invitation capability.
 * @param mobileHandshake - Mobile handshake message carried by the completion.
 * @returns 32-byte hash accepted by `deriveAuthenticationWords`.
 */
export async function deriveKeylessHandshakeHash(
  invitationSecret: Uint8Array,
  mobileHandshake: Uint8Array,
): Promise<Uint8Array> {
  return await digestKeyless(HANDSHAKE_HASH_DOMAIN, invitationSecret, mobileHandshake)
}

/**
 * Derive the independent 256-bit Personal Pairing key every keyless peer holds.
 * @param invitationSecret - 256-bit invitation capability.
 * @returns 32-byte HKDF input for pairing-scoped consumers.
 */
export async function deriveKeylessPairingKey(invitationSecret: Uint8Array): Promise<Uint8Array> {
  return await digestKeyless(PAIRING_KEY_DOMAIN, invitationSecret)
}

/** Development keyless adapter; production waits for the independently reviewed Noise provider. */
export class DevelopmentKeylessPairingHandshakeProvider implements PairingHandshakeProvider {
  /** @param input - fresh 256-bit invitation capability and expiry. @returns fingerprint and secret-carrying state. */
  async createChallenge(input: { invitationSecret: Uint8Array; expiresAt: number }): Promise<PairingHandshakeChallenge> {
    assertSecret(input.invitationSecret)
    return {
      desktopFingerprint: await deriveKeylessDesktopFingerprint(input.invitationSecret),
      state: input.invitationSecret.slice(),
    }
  }

  /** @param input - invitation secret, retained challenge state, and Mobile handshake. @returns pending key material. */
  async completeChallenge(input: {
    invitationSecret: Uint8Array
    challengeState: PairingChallengeState
    mobileHandshake: Uint8Array
  }): Promise<CompletedPairingHandshake> {
    assertSecret(input.invitationSecret)
    if (!bytesEqualConstantTime(input.challengeState, input.invitationSecret)) {
      throw new TypeError('Keyless Pairing Challenge state does not match its invitation')
    }
    const pairingKey = await deriveKeylessPairingKey(input.invitationSecret)
    return {
      handshakeHash: await deriveKeylessHandshakeHash(input.invitationSecret, input.mobileHandshake),
      desktopHandshake: pairingKey.slice(),
      pendingPairingKey: pairingKey,
    }
  }

  /** @param input - provider-private pending key. @returns public reference plus the owned allocation. */
  async activatePairing(input: {
    pendingPairingKey: PendingPairingKey
  }): Promise<{ keyReference: PersonalPairingKeyReference; activePairingKey: ActivePairingKey }> {
    assertSecret(input.pendingPairingKey)
    const digest = await digestKeyless(KEY_REFERENCE_DOMAIN, input.pendingPairingKey)
    return {
      keyReference: `keyless-${hex(digest, 8)}` as PersonalPairingKeyReference,
      activePairingKey: input.pendingPairingKey.slice(),
    }
  }

  /** @param input - provider-private pairing key and Mobile-only Relay grant. @returns development JSON encoding. */
  sealMobileRelayAuthority(input: { activePairingKey: ActivePairingKey; grant: RelayCredentialGrant }): Promise<Uint8Array> {
    return Promise.resolve(new TextEncoder().encode(JSON.stringify(input.grant)))
  }

  /** @param activePairingKey - provider-private allocation handle. @returns a 32-byte copy for HKDF consumers. */
  exportPairingKeyMaterial(activePairingKey: ActivePairingKey): Uint8Array {
    assertSecret(activePairingKey)
    return activePairingKey.slice()
  }

  /** @param state - provider-private invitation state to zero. */
  destroyChallenge(state: PairingChallengeState): void { state.fill(0) }
  /** @param state - provider-private pending key state to zero. */
  destroyPendingPairing(state: PendingPairingKey): void { state.fill(0) }
  /** @param activePairingKey - provider-private allocation handle to zero. */
  destroyPairing(activePairingKey: ActivePairingKey): void { activePairingKey.fill(0) }
}

function assertSecret(value: Uint8Array): void {
  if (value.byteLength !== 32) throw new TypeError('Keyless Personal Pairing values must contain exactly 256 bits')
}

async function digestKeyless(domain: string, ...parts: Uint8Array[]): Promise<Uint8Array> {
  const prefix = new TextEncoder().encode(domain)
  const message = new Uint8Array(prefix.byteLength + parts.reduce((total, part) => total + part.byteLength, 0))
  message.set(prefix)
  let offset = prefix.byteLength
  for (const part of parts) {
    message.set(part, offset)
    offset += part.byteLength
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', message))
}

function bytesEqualConstantTime(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] as number) ^ (right[index] as number)
  }
  return difference === 0
}

function hex(bytes: Uint8Array, length: number): string {
  return [...bytes.slice(0, length)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
