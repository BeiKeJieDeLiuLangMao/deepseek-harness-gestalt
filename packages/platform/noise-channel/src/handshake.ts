/** Snow `PairingHandshakeProvider` for production Personal Pairing. */

import type {
  ActivePairingKey,
  CompletedPairingHandshake,
  PairingChallengeState,
  PairingHandshakeChallenge,
  PairingHandshakeProvider,
  PendingPairingKey,
  PersonalPairingKeyReference,
} from '@deepseek-ai/dsh-remote-access'
import type { RelayCredentialGrant } from '@deepseek-ai/dsh-remote-access'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import {
  finishResponder,
  generateSnowKeypair,
  writeResponderMessage2,
} from './wasm.ts'

const CHALLENGE_VERSION = 1
const OPEN_VERSION = 2
const ACTIVE_VERSION = 3
const KEY_BYTES = 32
const CHALLENGE_BYTES = 1 + KEY_BYTES * 3
const IV_BYTES = 12

/**
 * Production Snow handshake adapter. Challenge state stores Desktop static and
 * ephemeral privates so a non-sticky instance can rebuild the responder.
 */
export class SnowPairingHandshakeProvider implements PairingHandshakeProvider {
  /** @param input - invitation PSK and expiry. @returns fingerprint, Desktop public key, and private state. */
  async createChallenge(input: { invitationSecret: Uint8Array; expiresAt: number }): Promise<PairingHandshakeChallenge> {
    assertPsk(input.invitationSecret)
    const desktop = await generateSnowKeypair()
    const ephemeral = await generateSnowKeypair()
    const state = new Uint8Array(CHALLENGE_BYTES)
    state[0] = CHALLENGE_VERSION
    state.set(desktop.privateKey, 1)
    state.set(desktop.publicKey, 1 + KEY_BYTES)
    state.set(ephemeral.privateKey, 1 + KEY_BYTES * 2)
    desktop.privateKey.fill(0)
    ephemeral.privateKey.fill(0)
    ephemeral.publicKey.fill(0)
    return {
      desktopFingerprint: `snow-${hex(desktop.publicKey, 8)}`,
      desktopStaticPublicKey: desktop.publicKey,
      state,
    }
  }

  /** @param input - invitation PSK, challenge state, and Mobile message 1. @returns message 2 and open pending state. */
  async completeChallenge(input: {
    invitationSecret: Uint8Array
    challengeState: PairingChallengeState
    mobileHandshake: Uint8Array
  }): Promise<CompletedPairingHandshake> {
    assertPsk(input.invitationSecret)
    const challenge = decodeChallenge(input.challengeState)
    const { message2 } = await writeResponderMessage2({
      desktopStaticPrivate: challenge.staticPrivate,
      desktopEphemeralPrivate: challenge.ephemeralPrivate,
      psk: input.invitationSecret,
      message1: input.mobileHandshake,
    })
    const pendingPairingKey = encodeOpenPending({
      staticPrivate: challenge.staticPrivate,
      ephemeralPrivate: challenge.ephemeralPrivate,
      psk: input.invitationSecret,
      message1: input.mobileHandshake,
    })
    challenge.staticPrivate.fill(0)
    challenge.ephemeralPrivate.fill(0)
    return {
      handshakeHash: new Uint8Array(32),
      desktopHandshake: message2,
      pendingPairingKey,
    }
  }

  /**
   * Read Mobile message 3 and replace the open pending state with the finished pairing key.
   * @param input - open pending state and Mobile message 3.
   * @returns finished handshake hash and active pending key.
   */
  async finishChallenge(input: {
    pendingPairingKey: PendingPairingKey
    mobileFinish: Uint8Array
  }): Promise<{ handshakeHash: Uint8Array; pendingPairingKey: PendingPairingKey }> {
    const open = decodeOpenPending(input.pendingPairingKey)
    const handshakeHash = await finishResponder({
      desktopStaticPrivate: open.staticPrivate,
      desktopEphemeralPrivate: open.ephemeralPrivate,
      psk: open.psk,
      message1: open.message1,
      message3: input.mobileFinish,
    })
    open.staticPrivate.fill(0)
    open.ephemeralPrivate.fill(0)
    open.psk.fill(0)
    const pendingPairingKey = new Uint8Array(1 + KEY_BYTES) as PendingPairingKey
    pendingPairingKey[0] = ACTIVE_VERSION
    pendingPairingKey.set(handshakeHash, 1)
    return { handshakeHash, pendingPairingKey }
  }

  /** @param input - finished pending key. @returns public reference and owned allocation. */
  async activatePairing(input: {
    pendingPairingKey: PendingPairingKey
  }): Promise<{ keyReference: PersonalPairingKeyReference; activePairingKey: ActivePairingKey }> {
    const pairingKey = decodeActiveKey(input.pendingPairingKey)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pairingKey))
    return {
      keyReference: `snow-${hex(digest, 8)}` as PersonalPairingKeyReference,
      activePairingKey: pairingKey as ActivePairingKey,
    }
  }

  /** @param input - pairing key and Mobile-only grant. @returns AES-GCM sealed grant. */
  async sealMobileRelayAuthority(input: {
    activePairingKey: ActivePairingKey
    grant: RelayCredentialGrant
  }): Promise<Uint8Array> {
    const key = await aesKey(decodeActiveKey(input.activePairingKey))
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const sealed = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(input.grant)),
    ))
    const out = new Uint8Array(IV_BYTES + sealed.byteLength)
    out.set(iv)
    out.set(sealed, IV_BYTES)
    return out
  }

  /** @param activePairingKey - finished pairing key handle. @returns 32-byte copy. */
  exportPairingKeyMaterial(activePairingKey: ActivePairingKey): Uint8Array {
    return decodeActiveKey(activePairingKey)
  }

  /** @param state - challenge state to zero. */
  destroyChallenge(state: PairingChallengeState): void { state.fill(0) }
  /** @param state - pending key to zero. */
  destroyPendingPairing(state: PendingPairingKey): void { state.fill(0) }
  /** @param activePairingKey - allocation handle to zero. */
  destroyPairing(activePairingKey: ActivePairingKey): void { activePairingKey.fill(0) }
}

/**
 * Open a grant sealed by {@link SnowPairingHandshakeProvider.sealMobileRelayAuthority}.
 * @param pairingKey - finished 32-byte handshake hash.
 * @param sealed - iv-prefixed AES-GCM bytes.
 * @returns Mobile Relay grant.
 */
export async function openSnowRelayAuthority(
  pairingKey: Uint8Array,
  sealed: Uint8Array,
): Promise<RelayCredentialGrant> {
  if (sealed.byteLength <= IV_BYTES) throw new TypeError('Snow Relay authority is truncated')
  const key = await aesKey(pairingKey)
  const plaintext = new TextDecoder().decode(new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sealed.slice(0, IV_BYTES) },
    key,
    sealed.slice(IV_BYTES),
  )))
  const value = JSON.parse(plaintext) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Snow Relay authority must be an object')
  }
  const record = value as Record<string, unknown>
  if (record.endpoint !== 'mobile') throw new TypeError('Snow Relay authority endpoint must be mobile')
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) <= 0) {
    throw new TypeError('Snow Relay authority revision must be positive')
  }
  return {
    endpoint: 'mobile',
    routeId: parseRelayRouteId(record.routeId),
    credential: parseRelayCredential(record.credential),
    revision: record.revision as number,
  }
}

function decodeChallenge(state: Uint8Array): {
  staticPrivate: Uint8Array
  publicKey: Uint8Array
  ephemeralPrivate: Uint8Array
} {
  if (state.byteLength !== CHALLENGE_BYTES || state[0] !== CHALLENGE_VERSION) {
    throw new TypeError('Snow challenge state is invalid')
  }
  return {
    staticPrivate: state.slice(1, 1 + KEY_BYTES),
    publicKey: state.slice(1 + KEY_BYTES, 1 + KEY_BYTES * 2),
    ephemeralPrivate: state.slice(1 + KEY_BYTES * 2),
  }
}

function encodeOpenPending(input: {
  staticPrivate: Uint8Array
  ephemeralPrivate: Uint8Array
  psk: Uint8Array
  message1: Uint8Array
}): PendingPairingKey {
  const out = new Uint8Array(1 + KEY_BYTES * 3 + 2 + input.message1.byteLength)
  out[0] = OPEN_VERSION
  out.set(input.staticPrivate, 1)
  out.set(input.ephemeralPrivate, 1 + KEY_BYTES)
  out.set(input.psk, 1 + KEY_BYTES * 2)
  out[1 + KEY_BYTES * 3] = input.message1.byteLength >> 8
  out[1 + KEY_BYTES * 3 + 1] = input.message1.byteLength & 0xff
  out.set(input.message1, 1 + KEY_BYTES * 3 + 2)
  return out as PendingPairingKey
}

function decodeOpenPending(state: Uint8Array): {
  staticPrivate: Uint8Array
  ephemeralPrivate: Uint8Array
  psk: Uint8Array
  message1: Uint8Array
} {
  if (state.byteLength < 1 + KEY_BYTES * 3 + 2 || state[0] !== OPEN_VERSION) {
    throw new TypeError('Snow open pairing state is invalid')
  }
  const length = ((state[1 + KEY_BYTES * 3] as number) << 8) | (state[1 + KEY_BYTES * 3 + 1] as number)
  if (state.byteLength !== 1 + KEY_BYTES * 3 + 2 + length) throw new TypeError('Snow open pairing state is truncated')
  return {
    staticPrivate: state.slice(1, 1 + KEY_BYTES),
    ephemeralPrivate: state.slice(1 + KEY_BYTES, 1 + KEY_BYTES * 2),
    psk: state.slice(1 + KEY_BYTES * 2, 1 + KEY_BYTES * 3),
    message1: state.slice(1 + KEY_BYTES * 3 + 2),
  }
}

function decodeActiveKey(state: Uint8Array): Uint8Array {
  if (state.byteLength === KEY_BYTES) return state.slice()
  if (state.byteLength === 1 + KEY_BYTES && state[0] === ACTIVE_VERSION) return state.slice(1)
  throw new TypeError('Snow pairing key is invalid')
}

function assertPsk(value: Uint8Array): void {
  if (value.byteLength !== KEY_BYTES) throw new TypeError('Snow invitation secret must contain exactly 256 bits')
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== KEY_BYTES) throw new TypeError('Snow pairing key must contain 32 bytes')
  return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function hex(bytes: Uint8Array, length: number): string {
  return [...bytes.slice(0, length)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
