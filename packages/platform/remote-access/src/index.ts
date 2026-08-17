/**
 * Remote Access capability and single-process Personal Pairing provider.
 * @module @deepseek-ai/dsh-remote-access
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  AccountProof,
  AccountService,
  InstallationId,
} from '@deepseek-ai/dsh-platform-account'

/** Fixed lifetime of one Personal Pairing invitation. */
export const PAIRING_CHALLENGE_TTL_MS = 2 * 60 * 1000
/** Pairing protocol major carried by every challenge in this implementation. */
export const PERSONAL_PAIRING_PROTOCOL_MAJOR = 1

/** Opaque identifier for one single-use Pairing Challenge. */
export type PairingChallengeId = Branded<'PairingChallengeId'>
/** Opaque rendezvous identifier used before a Personal Pairing exists. */
export type PairingRendezvousId = Branded<'PairingRendezvousId'>
/** Opaque id making repeated challenge completion idempotent. */
export type PairingCompletionId = Branded<'PairingCompletionId'>
/** Opaque id for a completed handshake awaiting Desktop confirmation. */
export type PendingPairingId = Branded<'PendingPairingId'>
/** Opaque identity for one independently revocable Mobile installation. */
export type DevicePrincipalId = Branded<'DevicePrincipalId'>
/** Opaque identity for one confirmed Personal Pairing. */
export type PersonalPairingId = Branded<'PersonalPairingId'>
/** Opaque reference to crypto-provider state for one challenge. */
export type PairingChallengeState = Uint8Array
/** Opaque reference to crypto-provider state awaiting Desktop confirmation. */
export type PendingPairingKey = Uint8Array

/** Current-installation Account authorization supplied to Remote Access. */
export interface PairingAccountAuthentication {
  /** Installation whose proof authorizes this operation. */
  installationId: InstallationId
  /** Current Platform Account access token. */
  accessToken: string
  /** Single-use proof created by the Installation key. */
  proof: AccountProof
}

/** Complete high-entropy invitation carried by QR and the one-time link. */
export interface PairingInvitation {
  /** Opaque challenge identity. */
  challengeId: PairingChallengeId
  /** Exactly 256 bits of invitation capability material. */
  invitationSecret: Uint8Array
  /** Fingerprint of the Desktop pairing key. */
  desktopFingerprint: string
  /** Opaque rendezvous identity. */
  rendezvousId: PairingRendezvousId
  /** Unix epoch milliseconds after which the invitation is invalid. */
  expiresAt: number
  /** Pairing protocol major required by both installations. */
  protocolMajor: typeof PERSONAL_PAIRING_PROTOCOL_MAJOR
}

/** Pairing Challenge projection shown only in Desktop Settings. */
export interface PairingChallengeView extends Omit<PairingInvitation, 'invitationSecret'> {
  /** Full one-time HTTPS link containing the complete invitation. */
  oneTimeLink: string
  /** QR content; byte-for-byte equal to {@link oneTimeLink}. */
  qrPayload: string
}

/** Result of preparing a Desktop challenge inside the reviewed crypto adapter. */
export interface PairingHandshakeChallenge {
  /** Human-readable fingerprint bound into the invitation. */
  desktopFingerprint: string
  /** Provider-private challenge state destroyed at every terminal outcome. */
  state: PairingChallengeState
}

/** Completed handshake material retained only until Desktop confirms or rejects it. */
export interface CompletedPairingHandshake {
  /** Noise handshake hash used to derive matching authentication words. */
  handshakeHash: Uint8Array
  /** Opaque response returned to the Mobile crypto adapter. */
  desktopHandshake: Uint8Array
  /** Provider-private independent key material awaiting activation. */
  pendingPairingKey: PendingPairingKey
}

/** Crypto adapter selected only after the independent Noise review. */
export interface PairingHandshakeProvider {
  /**
   * Prepare the Desktop half of one challenge.
   * @param input - fresh 256-bit invitation capability and expiry.
   * @returns fingerprint and provider-private state.
   */
  createChallenge(input: { invitationSecret: Uint8Array; expiresAt: number }): Promise<PairingHandshakeChallenge>
  /** Complete the cryptographic exchange without activating authority. */
  completeChallenge(input: {
    invitationSecret: Uint8Array
    challengeState: PairingChallengeState
    mobileHandshake: Uint8Array
  }): Promise<CompletedPairingHandshake>
  /** Activate one independently keyed pairing after Desktop confirmation. */
  activatePairing(input: { pendingPairingKey: PendingPairingKey }): Promise<{ keyReference: string }>
  /** Destroy provider-private invitation state after any terminal challenge outcome. */
  destroyChallenge(state: PairingChallengeState): void | Promise<void>
  /** Destroy provider-private pending key state after rejection or activation. */
  destroyPendingPairing(state: PendingPairingKey): void | Promise<void>
}

/** Construction inputs for the single-process Personal Pairing provider. */
export interface PersonalPairingProviderOptions {
  /** Platform Account public seam used to prove both Installations own one Account. */
  account: Pick<AccountService, 'current'>
  /** Replaceable reviewed handshake adapter; this package does not implement Noise. */
  handshake: PairingHandshakeProvider
  /** Clock used for fixed challenge expiry and deterministic assembled scenarios. */
  clock?: { now(): number }
  /** Cryptographic random source; production defaults to Web Crypto. */
  randomBytes?: (size: number) => Uint8Array
  /** Opaque id source for challenge and pairing records. */
  randomId?: (kind: 'challenge' | 'pairing' | 'principal' | 'completion') => string
  /** HTTPS origin and path used by both QR and full-link flows. */
  pairingLinkOrigin: string
}

/** Stable Personal Pairing failure categories safe for client branching. */
export type RemoteAccessErrorCode =
  | 'MOBILE_ACCESS_DISABLED'
  | 'PAIRING_ACCOUNT_MISMATCH'
  | 'PAIRING_CHALLENGE_INVALID'
  | 'PAIRING_CHALLENGE_EXPIRED'
  | 'PAIRING_CHALLENGE_USED'
  | 'PAIRING_PENDING_INVALID'

/** Personal Pairing failure with a content-free stable code. */
export class RemoteAccessError extends Error {
  /** Stable machine-readable failure category. */
  readonly code: RemoteAccessErrorCode

  /** @param code - stable category. @param message - credential-free diagnostic. */
  constructor(code: RemoteAccessErrorCode, message: string) {
    super(message)
    this.name = 'RemoteAccessError'
    this.code = code
  }
}

/** Device metadata presented for explicit Desktop confirmation. */
export interface PairingDeviceDescription {
  /** User-recognizable installation name. */
  name: string
  /** Mobile operating-system family. */
  platform: 'ios' | 'android'
}

/** Pending completion displayed identically on Mobile and Desktop. */
export interface PairingCompletionView {
  /** Opaque pending state selected by Desktop confirmation. */
  pendingPairingId: PendingPairingId
  /** Six words derived only from the completed handshake hash. */
  authenticationWords: readonly [string, string, string, string, string, string]
  /** Opaque handshake response for the Mobile crypto adapter. */
  desktopHandshake: Uint8Array
  /** Mobile installation metadata awaiting confirmation. */
  device: PairingDeviceDescription
}

/** Active Personal Pairing projection; pending handshakes never appear here. */
export interface PersonalPairingView {
  /** Opaque Personal Pairing identity. */
  id: PersonalPairingId
  /** Independently revocable Companion-only principal. */
  devicePrincipal: {
    id: DevicePrincipalId
    accountId: Branded<'PlatformAccountId'>
    installationId: InstallationId
    authority: 'companion-surface'
  }
  /** Mobile installation metadata confirmed by the Desktop user. */
  device: PairingDeviceDescription
  /** Unix epoch milliseconds of Desktop confirmation. */
  pairedAt: number
}

/** Desktop Installation Mobile Access state; the default is disabled. */
export interface MobileAccessState {
  /** Whether this Desktop may create invitations and authorize Companion traffic. */
  enabled: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteAccess: RemoteAccessService
  }
}

/** Remote Access capability owning the complete Personal Pairing lifecycle. */
export abstract class RemoteAccessService extends Service {
  /** @param ctx - Platform composition context receiving this capability. */
  constructor(ctx: Context) {
    super(ctx, 'remoteAccess')
  }

  /**
   * Create one two-minute invitation for a signed-in Desktop Installation.
   * @param input - Desktop authorization and opaque rendezvous identity.
   * @returns complete QR/link projection; no low-entropy fallback exists.
   */
  abstract createChallenge(input: {
    desktop: PairingAccountAuthentication
    rendezvousId: PairingRendezvousId
  }): Promise<PairingChallengeView>

  /**
   * Read the current Desktop Installation's Mobile Access state.
   * @param desktop - current Desktop authorization.
   * @returns whether Settings has enabled Mobile Access for this Installation.
   */
  abstract getMobileAccessState(desktop: PairingAccountAuthentication): Promise<MobileAccessState>

  /**
   * Set Mobile Access from the Desktop Settings owner.
   * @param input - current Desktop authorization and requested state.
   * @returns committed Mobile Access state.
   */
  abstract setMobileAccess(input: {
    desktop: PairingAccountAuthentication
    enabled: boolean
  }): Promise<MobileAccessState>

  /**
   * Complete the same-account cryptographic exchange without granting authority.
   * @param input - Mobile authorization, invitation, device metadata, and handshake bytes.
   * @returns pending result shown on both installations before Desktop confirmation.
   */
  abstract completeChallenge(input: {
    mobile: PairingAccountAuthentication
    completionId: PairingCompletionId
    oneTimeLink: string
    device: PairingDeviceDescription
    mobileHandshake: Uint8Array
  }): Promise<PairingCompletionView>

  /**
   * List active pairings visible to one signed-in Desktop Account.
   * @param desktop - current Desktop Account authorization.
   * @returns only confirmed pairings; pending handshakes are excluded.
   */
  abstract listPersonalPairings(desktop: PairingAccountAuthentication): Promise<readonly PersonalPairingView[]>

  /**
   * List completed handshakes awaiting this Desktop Installation's decision.
   * @param desktop - current Desktop authorization.
   * @returns pending handshakes owned by this Desktop Installation.
   */
  abstract listPendingPairings(desktop: PairingAccountAuthentication): Promise<readonly PairingCompletionView[]>

  /**
   * Activate one pending pairing after the Desktop user compares authentication words.
   * @param input - confirming Desktop and pending identity.
   * @returns independently keyed Companion-only Device Principal.
   */
  abstract confirmPairing(input: {
    desktop: PairingAccountAuthentication
    pendingPairingId: PendingPairingId
  }): Promise<PersonalPairingView>

  /**
   * Cancel one active invitation; repeated cancellation is a no-op.
   * @param input - owning Desktop authorization and challenge identity.
   */
  abstract cancelChallenge(input: {
    desktop: PairingAccountAuthentication
    challengeId: PairingChallengeId
  }): Promise<void>

  /**
   * Reject one pending handshake; repeated rejection is a no-op.
   * @param input - owning Desktop authorization and pending identity.
   */
  abstract rejectPairing(input: {
    desktop: PairingAccountAuthentication
    pendingPairingId: PendingPairingId
  }): Promise<void>
}

interface ChallengeRecord {
  invitation: PairingInvitation
  accountId: string
  desktopInstallationId: InstallationId
  state: PairingChallengeState
}

interface CompletionReplayRecord {
  accountId: string
  mobileInstallationId: InstallationId
  view: PairingCompletionView
}

interface PendingPairingRecord extends CompletionReplayRecord {
  desktopInstallationId: InstallationId
  pendingPairingKey: PendingPairingKey
}

type StoredPersonalPairing = PersonalPairingView & {
  desktopInstallationId: InstallationId
  keyReference: string
}

/** Single-process provider for challenge and Personal Pairing lifecycle behavior. */
export class PersonalPairingProvider extends RemoteAccessService {
  private readonly challenges = new Map<PairingChallengeId, ChallengeRecord>()
  private readonly completions = new Map<PairingCompletionId, CompletionReplayRecord>()
  private readonly pending = new Map<PendingPairingId, PendingPairingRecord>()
  private readonly pairings = new Map<PersonalPairingId, StoredPersonalPairing>()
  private readonly confirmed = new Map<PendingPairingId, {
    view: PersonalPairingView
    desktopInstallationId: InstallationId
  }>()
  private readonly cancelledChallenges = new Set<PairingChallengeId>()
  private readonly rejectedPending = new Set<PendingPairingId>()
  private readonly mobileAccess = new Set<string>()
  private serial: Promise<void> = Promise.resolve()
  private readonly clock: { now(): number }
  private readonly randomBytes: (size: number) => Uint8Array
  private readonly randomId: PersonalPairingProviderOptions['randomId']
  private readonly pairingLinkOrigin: string

  /** @param ctx - Platform context. @param options - Account, crypto, time, random, and link adapters. */
  constructor(ctx: Context, private readonly options: PersonalPairingProviderOptions) {
    super(ctx)
    const origin = new URL(options.pairingLinkOrigin)
    if (origin.protocol !== 'https:') throw new TypeError('Personal Pairing link origin must use HTTPS')
    this.pairingLinkOrigin = origin.toString()
    this.clock = options.clock ?? { now: () => Date.now() }
    this.randomBytes = options.randomBytes ?? secureRandomBytes
    this.randomId = options.randomId ?? (kind => `${kind}-${crypto.randomUUID()}`)
  }

  async createChallenge(input: {
    desktop: PairingAccountAuthentication
    rendezvousId: PairingRendezvousId
  }): Promise<PairingChallengeView> {
    return this.exclusive(async () => {
      const account = await this.options.account.current({
        accessToken: input.desktop.accessToken,
        proof: input.desktop.proof,
      })
      if (!this.mobileAccess.has(accessKey(account.id, input.desktop.installationId))) {
        throw new RemoteAccessError('MOBILE_ACCESS_DISABLED', 'Mobile Access is disabled for this Desktop Installation')
      }
      const invitationSecret = this.randomBytes(32)
      if (invitationSecret.byteLength !== 32) throw new TypeError('Personal Pairing random source must return 32 bytes')
      const expiresAt = this.clock.now() + PAIRING_CHALLENGE_TTL_MS
      const cryptoChallenge = await this.options.handshake.createChallenge({ invitationSecret, expiresAt })
      try {
        const invitation: PairingInvitation = {
          challengeId: parsePairingChallengeId(this.randomId?.('challenge')),
          invitationSecret: invitationSecret.slice(),
          desktopFingerprint: nonEmpty(cryptoChallenge.desktopFingerprint, 'Desktop fingerprint'),
          rendezvousId: parsePairingRendezvousId(input.rendezvousId),
          expiresAt,
          protocolMajor: PERSONAL_PAIRING_PROTOCOL_MAJOR,
        }
        if (this.challenges.has(invitation.challengeId)) {
          throw new TypeError('Personal Pairing id source reused an active challenge id')
        }
        const oneTimeLink = encodePairingInvitationLink(this.pairingLinkOrigin, invitation)
        this.challenges.set(invitation.challengeId, {
          invitation,
          accountId: account.id,
          desktopInstallationId: input.desktop.installationId,
          state: cryptoChallenge.state,
        })
        return { ...withoutSecret(invitation), oneTimeLink, qrPayload: oneTimeLink }
      } catch (error) {
        await this.options.handshake.destroyChallenge(cryptoChallenge.state)
        throw error
      }
    })
  }

  async getMobileAccessState(desktop: PairingAccountAuthentication): Promise<MobileAccessState> {
    const account = await this.options.account.current({ accessToken: desktop.accessToken, proof: desktop.proof })
    return { enabled: this.mobileAccess.has(accessKey(account.id, desktop.installationId)) }
  }

  async setMobileAccess(input: {
    desktop: PairingAccountAuthentication
    enabled: boolean
  }): Promise<MobileAccessState> {
    return this.exclusive(async () => {
      const account = await this.options.account.current({
        accessToken: input.desktop.accessToken,
        proof: input.desktop.proof,
      })
      const key = accessKey(account.id, input.desktop.installationId)
      if (input.enabled) {
        this.mobileAccess.add(key)
        return { enabled: true }
      }
      this.mobileAccess.delete(key)
      const challenges = [...this.challenges.values()].filter(challenge =>
        challenge.accountId === account.id && challenge.desktopInstallationId === input.desktop.installationId)
      for (const challenge of challenges) await this.destroyChallenge(challenge)
      const pending = [...this.pending.entries()].filter(([, record]) =>
        record.accountId === account.id && record.desktopInstallationId === input.desktop.installationId)
      for (const [pendingPairingId, record] of pending) {
        this.pending.delete(pendingPairingId)
        this.rejectedPending.add(pendingPairingId)
        await this.options.handshake.destroyPendingPairing(record.pendingPairingKey)
      }
      return { enabled: false }
    })
  }

  async completeChallenge(input: {
    mobile: PairingAccountAuthentication
    completionId: PairingCompletionId
    oneTimeLink: string
    device: PairingDeviceDescription
    mobileHandshake: Uint8Array
  }): Promise<PairingCompletionView> {
    return this.exclusive(async () => {
      const account = await this.options.account.current({
        accessToken: input.mobile.accessToken,
        proof: input.mobile.proof,
      })
      const completionId = parsePairingCompletionId(input.completionId)
      const previous = this.completions.get(completionId)
      if (previous !== undefined) {
        if (previous.accountId !== account.id || previous.mobileInstallationId !== input.mobile.installationId) {
          throw new RemoteAccessError('PAIRING_CHALLENGE_USED', 'Pairing completion id belongs to another Installation')
        }
        return cloneCompletion(previous.view)
      }

      const invitation = parsePairingInvitationLink(input.oneTimeLink)
      const challenge = this.challenges.get(invitation.challengeId)
      if (challenge === undefined || !sameInvitation(challenge.invitation, invitation)) {
        throw new RemoteAccessError('PAIRING_CHALLENGE_INVALID', 'Pairing invitation is invalid or unavailable')
      }
      if (this.clock.now() >= challenge.invitation.expiresAt) {
        await this.destroyChallenge(challenge)
        throw new RemoteAccessError('PAIRING_CHALLENGE_EXPIRED', 'Pairing invitation expired')
      }
      if (challenge.accountId !== account.id) {
        await this.destroyChallenge(challenge)
        throw new RemoteAccessError('PAIRING_ACCOUNT_MISMATCH', 'Desktop and Mobile must use the same Platform Account')
      }

      this.challenges.delete(invitation.challengeId)
      let completed: CompletedPairingHandshake
      try {
        completed = await this.options.handshake.completeChallenge({
          invitationSecret: invitation.invitationSecret,
          challengeState: challenge.state,
          mobileHandshake: input.mobileHandshake,
        })
      } finally {
        await this.options.handshake.destroyChallenge(challenge.state)
      }
      let view: PairingCompletionView
      try {
        view = {
          pendingPairingId: parsePendingPairingId(this.randomId?.('completion')),
          authenticationWords: deriveAuthenticationWords(completed.handshakeHash),
          desktopHandshake: completed.desktopHandshake.slice(),
          device: parseDevice(input.device),
        }
      } catch (error) {
        await this.options.handshake.destroyPendingPairing(completed.pendingPairingKey)
        throw error
      }
      this.completions.set(completionId, {
        accountId: account.id,
        mobileInstallationId: input.mobile.installationId,
        view,
      })
      this.pending.set(view.pendingPairingId, {
        accountId: account.id,
        desktopInstallationId: challenge.desktopInstallationId,
        mobileInstallationId: input.mobile.installationId,
        view,
        pendingPairingKey: completed.pendingPairingKey,
      })
      return cloneCompletion(view)
    })
  }

  async listPersonalPairings(desktop: PairingAccountAuthentication): Promise<readonly PersonalPairingView[]> {
    const account = await this.options.account.current({ accessToken: desktop.accessToken, proof: desktop.proof })
    return [...this.pairings.values()]
      .filter(pairing => pairing.devicePrincipal.accountId === account.id
        && pairing.desktopInstallationId === desktop.installationId)
      .map(clonePairing)
  }

  async listPendingPairings(desktop: PairingAccountAuthentication): Promise<readonly PairingCompletionView[]> {
    const account = await this.options.account.current({ accessToken: desktop.accessToken, proof: desktop.proof })
    return [...this.pending.values()]
      .filter(record => record.accountId === account.id && record.desktopInstallationId === desktop.installationId)
      .map(record => cloneCompletion(record.view))
  }

  async confirmPairing(input: {
    desktop: PairingAccountAuthentication
    pendingPairingId: PendingPairingId
  }): Promise<PersonalPairingView> {
    return this.exclusive(async () => {
      const account = await this.options.account.current({
        accessToken: input.desktop.accessToken,
        proof: input.desktop.proof,
      })
      const pendingPairingId = parsePendingPairingId(input.pendingPairingId)
      const previous = this.confirmed.get(pendingPairingId)
      if (previous !== undefined) {
        if (previous.view.devicePrincipal.accountId !== account.id
          || previous.desktopInstallationId !== input.desktop.installationId) {
          throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Pending Pairing belongs to another Desktop Installation')
        }
        return clonePairing(previous.view)
      }
      const record = this.pending.get(pendingPairingId)
      if (record === undefined
        || record.accountId !== account.id
        || record.desktopInstallationId !== input.desktop.installationId) {
        throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Pending Pairing is invalid or unavailable')
      }
      const activation = await this.options.handshake.activatePairing({
        pendingPairingKey: record.pendingPairingKey,
      })
      const keyReference = nonEmpty(activation.keyReference, 'Personal Pairing key reference')
      if ([...this.pairings.values()].some(pairing => pairing.keyReference === keyReference)) {
        await this.options.handshake.destroyPendingPairing(record.pendingPairingKey)
        this.pending.delete(pendingPairingId)
        throw new TypeError('Personal Pairing crypto adapter reused a pairing key reference')
      }
      const view: PersonalPairingView = {
        id: parsePersonalPairingId(this.randomId?.('pairing')),
        devicePrincipal: {
          id: parseDevicePrincipalId(this.randomId?.('principal')),
          accountId: account.id,
          installationId: record.mobileInstallationId,
          authority: 'companion-surface',
        },
        device: { ...record.view.device },
        pairedAt: this.clock.now(),
      }
      this.pending.delete(pendingPairingId)
      this.pairings.set(view.id, { ...view, desktopInstallationId: record.desktopInstallationId, keyReference })
      this.confirmed.set(pendingPairingId, {
        view,
        desktopInstallationId: record.desktopInstallationId,
      })
      await this.options.handshake.destroyPendingPairing(record.pendingPairingKey)
      return clonePairing(view)
    })
  }

  async cancelChallenge(input: {
    desktop: PairingAccountAuthentication
    challengeId: PairingChallengeId
  }): Promise<void> {
    await this.exclusive(async () => {
      const account = await this.options.account.current({
        accessToken: input.desktop.accessToken,
        proof: input.desktop.proof,
      })
      const challengeId = parsePairingChallengeId(input.challengeId)
      if (this.cancelledChallenges.has(challengeId)) return
      const challenge = this.challenges.get(challengeId)
      if (challenge === undefined
        || challenge.accountId !== account.id
        || challenge.desktopInstallationId !== input.desktop.installationId) {
        throw new RemoteAccessError('PAIRING_CHALLENGE_INVALID', 'Pairing Challenge is invalid or unavailable')
      }
      this.cancelledChallenges.add(challengeId)
      await this.destroyChallenge(challenge)
    })
  }

  async rejectPairing(input: {
    desktop: PairingAccountAuthentication
    pendingPairingId: PendingPairingId
  }): Promise<void> {
    await this.exclusive(async () => {
      const account = await this.options.account.current({
        accessToken: input.desktop.accessToken,
        proof: input.desktop.proof,
      })
      const pendingPairingId = parsePendingPairingId(input.pendingPairingId)
      if (this.rejectedPending.has(pendingPairingId)) return
      const record = this.pending.get(pendingPairingId)
      if (record === undefined
        || record.accountId !== account.id
        || record.desktopInstallationId !== input.desktop.installationId) {
        throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Pending Pairing is invalid or unavailable')
      }
      this.pending.delete(pendingPairingId)
      this.rejectedPending.add(pendingPairingId)
      await this.options.handshake.destroyPendingPairing(record.pendingPairingKey)
    })
  }

  private async destroyChallenge(challenge: ChallengeRecord): Promise<void> {
    this.challenges.delete(challenge.invitation.challengeId)
    await this.options.handshake.destroyChallenge(challenge.state)
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation, operation)
    this.serial = result.then(() => undefined, () => undefined)
    return result
  }
}

/**
 * Parse a challenge id at a wire, durable, or random-source boundary.
 * @param value - untrusted identifier value.
 * @returns branded non-empty challenge id.
 */
export function parsePairingChallengeId(value: unknown): PairingChallengeId {
  return nonEmpty(value, 'Pairing Challenge id') as PairingChallengeId
}

/**
 * Parse a rendezvous id at a wire, durable, or random-source boundary.
 * @param value - untrusted identifier value.
 * @returns branded non-empty rendezvous id.
 */
export function parsePairingRendezvousId(value: unknown): PairingRendezvousId {
  return nonEmpty(value, 'Pairing rendezvous id') as PairingRendezvousId
}

/**
 * Parse a completion id at a wire, durable, or random-source boundary.
 * @param value - untrusted identifier value.
 * @returns branded non-empty completion id.
 */
export function parsePairingCompletionId(value: unknown): PairingCompletionId {
  return nonEmpty(value, 'Pairing completion id') as PairingCompletionId
}

/**
 * Parse a pending pairing id at a wire, durable, or random-source boundary.
 * @param value - untrusted identifier value.
 * @returns branded non-empty pending pairing id.
 */
export function parsePendingPairingId(value: unknown): PendingPairingId {
  return nonEmpty(value, 'Pending Pairing id') as PendingPairingId
}

/**
 * Parse a Device Principal id at a wire, durable, or random-source boundary.
 * @param value - untrusted identifier value.
 * @returns branded non-empty Device Principal id.
 */
export function parseDevicePrincipalId(value: unknown): DevicePrincipalId {
  return nonEmpty(value, 'Device Principal id') as DevicePrincipalId
}

/**
 * Parse a Personal Pairing id at a wire, durable, or random-source boundary.
 * @param value - untrusted identifier value.
 * @returns branded non-empty Personal Pairing id.
 */
export function parsePersonalPairingId(value: unknown): PersonalPairingId {
  return nonEmpty(value, 'Personal Pairing id') as PersonalPairingId
}

/**
 * Parse and validate the complete one-time invitation link.
 * @param value - untrusted QR or deep-link value.
 * @returns validated invitation carrying exactly 256 secret bits.
 */
export function parsePairingInvitationLink(value: unknown): PairingInvitation {
  const raw = nonEmpty(value, 'Pairing invitation link')
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new TypeError('Pairing invitation link must use HTTPS')
  const exact = (name: string): string => {
    const values = url.searchParams.getAll(name)
    if (values.length !== 1 || values[0] === '') throw new TypeError(`Pairing invitation ${name} must occur once`)
    return values[0] as string
  }
  const secret = decodeBase64Url(exact('secret'))
  if (secret.byteLength !== 32) throw new TypeError('Pairing invitation secret must contain exactly 256 bits')
  const expiresAt = Number(exact('expires'))
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new TypeError('Pairing invitation expiry must be a positive epoch')
  const protocolMajor = Number(exact('protocol'))
  if (protocolMajor !== PERSONAL_PAIRING_PROTOCOL_MAJOR) throw new TypeError('Pairing invitation protocol major is unsupported')
  return {
    challengeId: parsePairingChallengeId(exact('challenge')),
    invitationSecret: secret,
    desktopFingerprint: nonEmpty(exact('fingerprint'), 'Desktop fingerprint'),
    rendezvousId: parsePairingRendezvousId(exact('rendezvous')),
    expiresAt,
    protocolMajor,
  }
}

function encodePairingInvitationLink(origin: string, invitation: PairingInvitation): string {
  const url = new URL(origin)
  url.searchParams.set('challenge', invitation.challengeId)
  url.searchParams.set('secret', encodeBase64Url(invitation.invitationSecret))
  url.searchParams.set('fingerprint', invitation.desktopFingerprint)
  url.searchParams.set('rendezvous', invitation.rendezvousId)
  url.searchParams.set('expires', String(invitation.expiresAt))
  url.searchParams.set('protocol', String(invitation.protocolMajor))
  return url.toString()
}

function withoutSecret(invitation: PairingInvitation): Omit<PairingInvitation, 'invitationSecret'> {
  const { invitationSecret: _invitationSecret, ...view } = invitation
  return view
}

const AUTHENTICATION_WORDS = [
  'amber', 'binary', 'cedar', 'delta', 'ember', 'frost', 'garden', 'harbor',
  'indigo', 'juniper', 'kernel', 'linen', 'meteor', 'nectar', 'orbit', 'pebble',
  'quartz', 'raven', 'silver', 'timber', 'ultra', 'velvet', 'willow', 'xenon',
  'yellow', 'zenith', 'acorn', 'bridge', 'coral', 'drift', 'elm', 'flame',
  'globe', 'hazel', 'island', 'jasmine', 'kite', 'lemon', 'maple', 'north',
  'ocean', 'piano', 'quiet', 'river', 'stone', 'tulip', 'unity', 'violet',
  'water', 'xylem', 'yonder', 'zebra', 'atlas', 'breeze', 'cloud', 'dawn',
  'earth', 'forest', 'gold', 'hill', 'iris', 'jade', 'kindle', 'lake',
] as const

/**
 * Derive six matching human-readable words from a reviewed handshake hash.
 * @param handshakeHash - at least 32 bytes returned by the crypto adapter.
 * @returns stable 36-bit authentication-word display.
 */
export function deriveAuthenticationWords(
  handshakeHash: Uint8Array,
): readonly [string, string, string, string, string, string] {
  if (handshakeHash.byteLength < 32) throw new TypeError('Pairing handshake hash must contain at least 32 bytes')
  return [0, 1, 2, 3, 4, 5].map(index =>
    AUTHENTICATION_WORDS[(handshakeHash[index] as number) & 63]) as unknown as readonly [
    string, string, string, string, string, string,
  ]
}

function sameInvitation(left: PairingInvitation, right: PairingInvitation): boolean {
  return left.challengeId === right.challengeId
    && left.desktopFingerprint === right.desktopFingerprint
    && left.rendezvousId === right.rendezvousId
    && left.expiresAt === right.expiresAt
    && encodeBase64Url(left.invitationSecret) === encodeBase64Url(right.invitationSecret)
}

function parseDevice(value: unknown): PairingDeviceDescription {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Pairing device must be an object')
  }
  const device = value as Record<string, unknown>
  const name = nonEmpty(device.name, 'Pairing device name')
  if (device.platform !== 'ios' && device.platform !== 'android') {
    throw new TypeError('Pairing device platform must be ios or android')
  }
  return { name, platform: device.platform }
}

function cloneCompletion(view: PairingCompletionView): PairingCompletionView {
  return {
    ...view,
    authenticationWords: [...view.authenticationWords],
    desktopHandshake: view.desktopHandshake.slice(),
    device: { ...view.device },
  }
}

function clonePairing(view: PersonalPairingView): PersonalPairingView {
  return {
    id: view.id,
    devicePrincipal: { ...view.devicePrincipal },
    device: { ...view.device },
    pairedAt: view.pairedAt,
  }
}

function accessKey(accountId: string, installationId: InstallationId): string {
  return `${accountId}\u0000${installationId}`
}

function secureRandomBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size))
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError('Pairing invitation secret must be canonical base64url')
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new TypeError('Pairing invitation secret must be canonical base64url')
  }
  const decoded = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (encodeBase64Url(decoded) !== value) throw new TypeError('Pairing invitation secret must be canonical base64url')
  return decoded
}

function nonEmpty(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be non-empty`)
  return value
}

export default RemoteAccessService
