/** Desktop process ownership for endpoint Snow invitations and reconnect static state. */

import { SnowDesktopEndpointPairingOwner } from '@deepseek-ai/dsh-noise-channel'
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  parsePersonalPairingId,
  type PairingChallengeId,
  type PendingPairingId,
  type PersonalPairingId,
} from '@deepseek-ai/dsh-remote-access'
import type { RelayPairingSelector } from '@deepseek-ai/dsh-remote-protocol'

const MAX_PAIRING_STATES = 16

interface PersistedSnowPairingState {
  pairingId: PersonalPairingId
  reconnectState: Uint8Array
}

/** Encryption operations supplied by Electron safeStorage. */
export interface DesktopSnowPairingProtection {
  encrypt(value: string): Uint8Array
  decrypt(value: Uint8Array): string
}

/** Encrypted owner-only persistence for Desktop Snow reconnect state. */
export class EncryptedDesktopSnowPairingStore {
  constructor(private readonly path: string, private readonly protection: DesktopSnowPairingProtection) {}

  async load(): Promise<readonly PersistedSnowPairingState[]> {
    let encoded: string
    try { encoded = await readFile(this.path, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const value: unknown = JSON.parse(this.protection.decrypt(Buffer.from(encoded, 'base64')))
    if (!Array.isArray(value) || value.length > MAX_PAIRING_STATES) {
      throw new TypeError('Desktop Snow pairing store must contain a bounded array')
    }
    return value.map((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new TypeError('Desktop Snow pairing store record must be an object')
      }
      const record = item as Record<string, unknown>
      if (Object.keys(record).length !== 2 || typeof record.state !== 'string') {
        throw new TypeError('Desktop Snow pairing store record is invalid')
      }
      const reconnectState = new Uint8Array(Buffer.from(record.state, 'base64url'))
      if (reconnectState.byteLength !== 96) throw new TypeError('Desktop Snow reconnect state must contain 96 bytes')
      return { pairingId: parsePersonalPairingId(record.pairingId), reconnectState }
    })
  }

  async save(records: readonly PersistedSnowPairingState[]): Promise<void> {
    const plaintext = JSON.stringify(records.map(record => ({
      pairingId: record.pairingId,
      state: Buffer.from(record.reconnectState).toString('base64url'),
    })))
    const encrypted = this.protection.encrypt(plaintext)
    await writeFileAtomic(this.path, Buffer.from(encrypted).toString('base64'), { mode: 0o600, dirMode: 0o700 })
  }
}

/** Endpoint-private Snow state never passed to Platform transports or codecs. */
export class DesktopSnowPairingVault {
  private readonly challenges = new Map<PairingChallengeId, SnowDesktopEndpointPairingOwner>()
  private readonly pending = new Map<PendingPairingId, SnowDesktopEndpointPairingOwner>()
  private readonly active = new Map<PersonalPairingId, Uint8Array>()
  private persistence: Promise<void> = Promise.resolve()

  constructor(private readonly store?: EncryptedDesktopSnowPairingStore) {}

  /** Load encrypted reconnect state before the Relay lifecycle can attach. */
  static async load(store?: EncryptedDesktopSnowPairingStore): Promise<DesktopSnowPairingVault> {
    const vault = new DesktopSnowPairingVault(store)
    for (const record of await store?.load() ?? []) vault.active.set(record.pairingId, record.reconnectState.slice())
    return vault
  }

  /** @returns a fresh endpoint-owned invitation owner and public invitation projection. */
  async createInvitation(expiresAt: number): Promise<{
    owner: SnowDesktopEndpointPairingOwner
    invitationPayload: Uint8Array
    desktopFingerprint: string
  }> {
    if (this.challenges.size + this.pending.size >= MAX_PAIRING_STATES) {
      throw new Error('Desktop Snow pending pairing limit reached')
    }
    const owner = new SnowDesktopEndpointPairingOwner()
    return { owner, ...await owner.createInvitation(expiresAt) }
  }

  /** Retain one invitation under the Platform-assigned challenge id. */
  retainChallenge(challengeId: PairingChallengeId, owner: SnowDesktopEndpointPairingOwner): void {
    const previous = this.challenges.get(challengeId)
    if (previous !== undefined && previous !== owner) throw new Error('Desktop Snow challenge id collided')
    this.challenges.set(challengeId, owner)
  }

  /** Move one invitation owner to its stable pending identity. */
  bindPending(challengeId: PairingChallengeId, pendingPairingId: PendingPairingId): SnowDesktopEndpointPairingOwner {
    const existing = this.pending.get(pendingPairingId)
    if (existing !== undefined) return existing
    const owner = this.challenges.get(challengeId)
    if (owner === undefined) throw new Error('Desktop Snow mailbox has no local invitation owner')
    this.challenges.delete(challengeId)
    this.pending.set(pendingPairingId, owner)
    return owner
  }

  /** Read a pending endpoint-owned handshake. */
  pendingOwner(pendingPairingId: PendingPairingId): SnowDesktopEndpointPairingOwner | undefined {
    return this.pending.get(pendingPairingId)
  }

  /** Drop and zero one unused invitation. */
  cancelChallenge(challengeId: PairingChallengeId): void {
    this.challenges.get(challengeId)?.wipe()
    this.challenges.delete(challengeId)
  }

  /** Drop and zero one rejected pending handshake. */
  rejectPending(pendingPairingId: PendingPairingId): void {
    this.pending.get(pendingPairingId)?.wipe()
    this.pending.delete(pendingPairingId)
  }

  /** Commit reconnect state under the non-secret selector returned by Platform confirmation. */
  activate(pendingPairingId: PendingPairingId, pairingId: PersonalPairingId, reconnectState: Uint8Array): void {
    if (reconnectState.byteLength !== 96) throw new TypeError('Desktop Snow reconnect state must contain 96 bytes')
    if (!this.active.has(pairingId) && this.active.size >= MAX_PAIRING_STATES) {
      throw new Error('Desktop Snow active pairing limit reached')
    }
    this.release(pairingId)
    this.active.set(pairingId, reconnectState.slice())
    const owner = this.pending.get(pendingPairingId)
    this.pending.delete(pendingPairingId)
    owner?.wipe()
    this.persist()
  }

  /** Read a defensive reconnect-state copy by Relay pairing selector. */
  reconnectState(selector: RelayPairingSelector): Uint8Array | undefined {
    return this.active.get(selector as PersonalPairingId)?.slice()
  }

  /** Drop one active pairing and zero its static state. */
  release(pairingId: PersonalPairingId): void {
    const state = this.active.get(pairingId)
    state?.fill(0)
    this.active.delete(pairingId)
    this.persist()
  }

  /** Zero every endpoint-owned invitation and reconnect allocation. */
  clear(): void {
    for (const owner of this.challenges.values()) owner.wipe()
    for (const owner of this.pending.values()) owner.wipe()
    for (const state of this.active.values()) state.fill(0)
    this.challenges.clear()
    this.pending.clear()
    this.active.clear()
    this.persist()
  }

  /** Wait until every encrypted atomic replacement queued by this owner completes. */
  async flush(): Promise<void> { await this.persistence }

  private persist(): void {
    if (this.store === undefined) return
    const records = [...this.active].map(([pairingId, reconnectState]) => ({
      pairingId, reconnectState: reconnectState.slice(),
    }))
    this.persistence = this.persistence.then(async () => {
      try { await this.store?.save(records) } finally {
        for (const record of records) record.reconnectState.fill(0)
      }
    })
  }
}
