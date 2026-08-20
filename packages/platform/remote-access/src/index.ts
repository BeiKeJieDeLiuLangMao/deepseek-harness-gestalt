/**
 * Remote Access capability with instance-local handshakes and shared confirmed authority.
 * @module @deepseek-ai/dsh-remote-access
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  AccountProof,
  AccountService,
  AuthenticatedInstallationView,
  InstallationId,
} from '@deepseek-ai/dsh-platform-account'
import { parseRelayRouteId, type RelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import type { RelayCredentialGrant, RemoteRelayService } from './relay.ts'

export * from './relay.ts'
export * from './open-registration-quotas.ts'
export * from './platform-operations.ts'
export * from './keyless-handshake.ts'

/** Fixed lifetime of one Personal Pairing invitation. */
export const PAIRING_CHALLENGE_TTL_MS = 2 * 60 * 1000
/** Absolute lifetime of idempotency projections after a terminal transition. */
export const PAIRING_REPLAY_RETENTION_MS = 5 * 60 * 1000
/** Maximum live invitations owned by one authenticated Desktop Installation. */
export const MAX_ACTIVE_PAIRING_CHALLENGES_PER_INSTALLATION = 4
/** Maximum unconfirmed handshakes owned by one authenticated Installation. */
export const MAX_PENDING_PAIRINGS_PER_INSTALLATION = 4
/** Maximum live and replay-retained lifecycle records owned by one authenticated Installation. */
export const MAX_RETAINED_PAIRING_RECORDS_PER_INSTALLATION = 16
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
/** Opaque provider reference for one active Personal Pairing key. */
export type PersonalPairingKeyReference = Branded<'PersonalPairingKeyReference'>
/** Opaque reference to crypto-provider state for one challenge. */
export type PairingChallengeState = Uint8Array
/** Opaque reference to crypto-provider state awaiting Desktop confirmation. */
export type PendingPairingKey = Uint8Array
/** Provider-private handle that owns exactly one newly activated key allocation. */
export type ActivePairingKey = Uint8Array

/** Current-installation Account authorization supplied to Remote Access. */
export interface PairingAccountAuthentication {
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
  /**
   * Complete the cryptographic exchange without activating authority.
   * @param input - invitation secret, provider-private challenge state, and Mobile handshake.
   * @returns pending key, handshake hash, and Desktop response.
   */
  completeChallenge(input: {
    invitationSecret: Uint8Array
    challengeState: PairingChallengeState
    mobileHandshake: Uint8Array
  }): Promise<CompletedPairingHandshake>
  /**
   * Activate one independently keyed pairing after Desktop confirmation.
   * @param input - provider-private pending key.
   * @returns public reference plus an ownership-safe handle for this allocation.
   */
  activatePairing(input: {
    pendingPairingKey: PendingPairingKey
  }): Promise<{ keyReference: PersonalPairingKeyReference; activePairingKey: ActivePairingKey }>
  /**
   * Seal endpoint-specific Relay authority to the newly activated Mobile pairing key.
   * @param input - provider-private pairing key and Mobile-only Relay grant.
   * @returns opaque bytes that only the paired Mobile crypto adapter can open.
   */
  sealMobileRelayAuthority?(input: {
    activePairingKey: ActivePairingKey
    grant: RelayCredentialGrant
  }): Promise<Uint8Array>
  /**
   * Export the independent key material of one activated pairing for pairing-scoped consumers.
   * @param activePairingKey - provider-private allocation handle held by the confirmed pairing.
   * @returns copy of at least 32 bytes; endpoints use it only as HKDF input.
   */
  exportPairingKeyMaterial?(activePairingKey: ActivePairingKey): Uint8Array | Promise<Uint8Array>
  /** @param state - provider-private invitation state to destroy. */
  destroyChallenge(state: PairingChallengeState): void | Promise<void>
  /** @param state - provider-private pending key state to destroy. */
  destroyPendingPairing(state: PendingPairingKey): void | Promise<void>
  /** @param activePairingKey - provider-private allocation handle returned by activation. */
  destroyPairing(activePairingKey: ActivePairingKey): void | Promise<void>
}

/** Construction inputs for the Personal Pairing provider. */
export interface PersonalPairingProviderOptions {
  /** Platform Account public seam used to prove both Installations own one Account. */
  account: Pick<AccountService, 'currentInstallation'>
  /** Replaceable reviewed handshake adapter; this package does not implement Noise. */
  handshake: PairingHandshakeProvider
  /** Optional assembled Relay authority; production omits it until the crypto gate is approved. */
  relay?: Pick<RemoteRelayService, 'rotateCredential' | 'issueCredential' | 'revokeCredential' | 'revokeRoute'>
  /** Deployment-owned durable Mobile Access and pairing-to-route authority. */
  authority?: PersonalPairingAuthorityStore
  /** Clock used for fixed challenge expiry and deterministic assembled scenarios. */
  clock?: { now(): number }
  /** Cryptographic random source; production defaults to Web Crypto. */
  randomBytes?: (size: number) => Uint8Array
  /** Opaque id source for challenge and pairing records. */
  randomId?: (kind: 'challenge' | 'pairing' | 'principal' | 'completion' | 'relay-route') => string
  /** Expiry scheduler; production defaults to the process timer. */
  schedule?: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  /** HTTPS origin and path used by both QR and full-link flows. */
  pairingLinkOrigin: string
}

/** Stable Personal Pairing failure categories safe for client branching. */
export type RemoteAccessErrorCode =
  | 'MOBILE_ACCESS_DISABLED'
  | 'PAIRING_ACCOUNT_MISMATCH'
  | 'PAIRING_INSTALLATION_KIND_INVALID'
  | 'PAIRING_CHALLENGE_INVALID'
  | 'PAIRING_CHALLENGE_EXPIRED'
  | 'PAIRING_CHALLENGE_USED'
  | 'PAIRING_PENDING_INVALID'
  | 'PAIRING_ID_COLLISION'
  | 'PAIRING_RESOURCE_LIMIT'

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
  /** Unix epoch milliseconds of the last observed Companion access. */
  lastAccessAt: number
  /** Whether a live Relay attachment is currently registered for this pairing. */
  online: boolean
}

/** Desktop Installation Mobile Access state; the default is disabled. */
export interface MobileAccessState {
  /** Whether this Desktop may create invitations and authorize Companion traffic. */
  enabled: boolean
  /** Fresh Relay authority returned only by a successful enable mutation. */
  relay?: RelayCredentialGrant
}

/** Mobile projection of the Desktop confirmation decision. */
export type MobilePairingStatus =
  | { status: 'pending' }
  | { status: 'paired'; pairingId: PersonalPairingId; sealedRelayAuthority?: Uint8Array }
  | { status: 'rejected' }

/** Durable Desktop route state shared by every Platform Instance. */
export interface DesktopRemoteAccessAuthority {
  /** Whether this Desktop installation currently admits Remote Access operations. */
  enabled: boolean
  /** Active Relay route when enabled. */
  routeId?: RelayRouteId
}

/** Durable confirmed Mobile pairing projection returned through the pairing flow. */
export interface MobilePairingAuthority {
  accountId: Branded<'PlatformAccountId'>
  desktopInstallationId: InstallationId
  mobileInstallationId: InstallationId
  pendingPairingId: PendingPairingId
  pairingId: PersonalPairingId
  sealedRelayAuthority?: Uint8Array
}

/** Deployment-owned atomic authority store shared by non-sticky Platform Instances. */
export interface PersonalPairingAuthorityStore {
  /**
   * Exclusively own the durable short-lived pairing transaction state.
   * Mutations, including cleanup tombstones retained by a rejected operation, must be persisted before settlement.
   * @param operation - bounded state transition serialized across every Platform Instance.
   * @returns the operation result after its state changes are durable.
   */
  runPairingTransaction<T>(operation: (state: PersonalPairingTransactionState) => Promise<T>): Promise<T>
  /** Read current Desktop access without process-local caching. */
  getDesktop(accountId: Branded<'PlatformAccountId'>, desktopInstallationId: InstallationId): Promise<DesktopRemoteAccessAuthority>
  /** Atomically keep an active route or install the supplied fresh route. */
  enableDesktop(accountId: Branded<'PlatformAccountId'>, desktopInstallationId: InstallationId, freshRouteId: RelayRouteId): Promise<RelayRouteId>
  /** Atomically disable access, remove Mobile grants, and return every route still requiring revocation. */
  disableDesktop(accountId: Branded<'PlatformAccountId'>, desktopInstallationId: InstallationId): Promise<readonly RelayRouteId[]>
  /** Mark one route's external Relay revocation complete without touching a replacement route. */
  completeRouteRevocation(accountId: Branded<'PlatformAccountId'>, desktopInstallationId: InstallationId, routeId: RelayRouteId): Promise<void>
  /** Persist the confirmed pairing-to-route result before Mobile observes confirmation. */
  confirmMobilePairing(authority: MobilePairingAuthority): Promise<void>
  /** Read a confirmed Mobile result from any Platform Instance. */
  getMobilePairing(pendingPairingId: PendingPairingId): Promise<MobilePairingAuthority | undefined>
  /** Drop one confirmed Mobile pairing result after Desktop revocation. */
  revokeMobilePairing(pairingId: PersonalPairingId): Promise<void>
}

/** Durable short-lived pairing transaction records loaded under one store-owned exclusive lease. */
export interface PersonalPairingTransactionState {
  challenges: Map<PairingChallengeId, ChallengeRecord>
  settledChallenges: Map<PairingChallengeId, SettledChallengeRecord>
  completions: Map<PairingCompletionId, CompletionReplayRecord>
  pending: Map<PendingPairingId, PendingPairingRecord>
  settledPending: Map<PendingPairingId, SettledPendingRecord>
  pairings: Map<PersonalPairingId, StoredPersonalPairing>
  principalIds: Set<DevicePrincipalId>
  orphanPendingCleanups: Map<CleanupRecord<PendingPairingKey>, OrphanPendingCleanupRecord>
}

interface StoredDesktopAuthority {
  activeRouteId?: RelayRouteId
  revokingRouteIds: Set<RelayRouteId>
}

/** In-memory authority adapter for keyless tests; deployments supply a durable shared adapter. */
export class MemoryPersonalPairingAuthorityStore implements PersonalPairingAuthorityStore {
  private readonly desktops = new Map<string, StoredDesktopAuthority>()
  private readonly pairings = new Map<PendingPairingId, MobilePairingAuthority>()
  private readonly pairingTransactions = createPairingTransactionState()
  private pairingSerial: Promise<void> = Promise.resolve()

  runPairingTransaction<T>(operation: (state: PersonalPairingTransactionState) => Promise<T>): Promise<T> {
    const result = this.pairingSerial.then(
      () => operation(this.pairingTransactions),
      () => operation(this.pairingTransactions),
    )
    this.pairingSerial = result.then(() => undefined, () => undefined)
    return result
  }

  getDesktop(accountId: Branded<'PlatformAccountId'>, desktopInstallationId: InstallationId): Promise<DesktopRemoteAccessAuthority> {
    const routeId = this.desktops.get(accessKey(accountId, desktopInstallationId))?.activeRouteId
    return Promise.resolve(routeId === undefined ? { enabled: false } : { enabled: true, routeId })
  }

  enableDesktop(accountId: Branded<'PlatformAccountId'>, desktopInstallationId: InstallationId, freshRouteId: RelayRouteId): Promise<RelayRouteId> {
    const key = accessKey(accountId, desktopInstallationId)
    const record = this.desktops.get(key) ?? { revokingRouteIds: new Set<RelayRouteId>() }
    record.activeRouteId ??= freshRouteId
    this.desktops.set(key, record)
    return Promise.resolve(record.activeRouteId)
  }

  disableDesktop(accountId: Branded<'PlatformAccountId'>, desktopInstallationId: InstallationId): Promise<readonly RelayRouteId[]> {
    const key = accessKey(accountId, desktopInstallationId)
    const record = this.desktops.get(key) ?? { revokingRouteIds: new Set<RelayRouteId>() }
    if (record.activeRouteId !== undefined) {
      record.revokingRouteIds.add(record.activeRouteId)
      delete record.activeRouteId
    }
    this.desktops.set(key, record)
    for (const [pendingPairingId, pairing] of this.pairings) {
      if (pairing.accountId === accountId && pairing.desktopInstallationId === desktopInstallationId) {
        this.pairings.delete(pendingPairingId)
      }
    }
    return Promise.resolve([...record.revokingRouteIds])
  }

  completeRouteRevocation(accountId: Branded<'PlatformAccountId'>, desktopInstallationId: InstallationId, routeId: RelayRouteId): Promise<void> {
    const key = accessKey(accountId, desktopInstallationId)
    const record = this.desktops.get(key)
    if (record === undefined) return Promise.resolve()
    record.revokingRouteIds.delete(routeId)
    if (record.activeRouteId === undefined && record.revokingRouteIds.size === 0) this.desktops.delete(key)
    return Promise.resolve()
  }

  confirmMobilePairing(authority: MobilePairingAuthority): Promise<void> {
    const existing = this.pairings.get(authority.pendingPairingId)
    if (existing !== undefined && !sameMobileAuthority(existing, authority)) {
      return Promise.reject(new RemoteAccessError('PAIRING_ID_COLLISION', 'Pending Pairing authority was already committed'))
    }
    this.pairings.set(authority.pendingPairingId, cloneMobileAuthority(authority))
    return Promise.resolve()
  }

  getMobilePairing(pendingPairingId: PendingPairingId): Promise<MobilePairingAuthority | undefined> {
    const authority = this.pairings.get(pendingPairingId)
    return Promise.resolve(authority === undefined ? undefined : cloneMobileAuthority(authority))
  }

  revokeMobilePairing(pairingId: PersonalPairingId): Promise<void> {
    for (const [pendingPairingId, pairing] of this.pairings) {
      if (pairing.pairingId === pairingId) this.pairings.delete(pendingPairingId)
    }
    return Promise.resolve()
  }
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
   * Rotate and return fresh Desktop-only Relay authority after process startup or window reopen.
   * @param desktop - current Desktop authorization for an enabled installation.
   * @returns enabled state carrying a fresh Desktop grant.
   */
  abstract reissueDesktopRelayAuthority(desktop: PairingAccountAuthentication): Promise<MobileAccessState>

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
   * Read the decision for one pairing completed by the current Mobile Installation.
   * @param input - current Mobile authorization and pending identity.
   * @returns pending, paired, or rejected without exposing Desktop authority.
   */
  abstract getMobilePairingStatus(input: {
    mobile: PairingAccountAuthentication
    pendingPairingId: PendingPairingId
  }): Promise<MobilePairingStatus>

  /**
   * List active pairings visible to one signed-in Desktop Account.
   * @param desktop - current Desktop Account authorization.
   * @returns only confirmed pairings; pending handshakes are excluded.
   */
  abstract listPersonalPairings(desktop: PairingAccountAuthentication): Promise<readonly PersonalPairingView[]>

  /**
   * Revoke one confirmed pairing: destroy its key, drop Mobile Relay authority, and close live attachments.
   * @param input - Desktop authorization and pairing identity.
   */
  abstract revokePersonalPairing(input: {
    desktop: PairingAccountAuthentication
    pairingId: PersonalPairingId
  }): Promise<void>

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

/** Durable ownership tombstone for provider-private crypto material. */
export interface CleanupRecord<T> { resource?: T }

/** Pending-key cleanup retained when allocation fails before a pending id commits. */
export interface OrphanPendingCleanupRecord {
  accountId: string
  desktopInstallationId: InstallationId
  mobileInstallationId: InstallationId
  cleanup: CleanupRecord<PendingPairingKey>
}

/** Durable live Pairing Challenge transaction. */
export interface ChallengeRecord {
  invitation: PairingInvitation
  accountId: string
  desktopInstallationId: InstallationId
  cleanup: CleanupRecord<PairingChallengeState>
}

/** Terminal Pairing Challenge outcome retained for bounded replay. */
export type ChallengeOutcome = 'cancelled' | 'expired' | 'completed' | 'account-mismatch' | 'disabled' | 'disposed'
/** Durable terminal Pairing Challenge transaction. */
export interface SettledChallengeRecord {
  accountId: string
  desktopInstallationId: InstallationId
  outcome: ChallengeOutcome
  cleanup: CleanupRecord<PairingChallengeState>
  settledAt: number
}

/** Durable idempotency projection for one completed Mobile handshake. */
export interface CompletionReplayRecord {
  accountId: string
  desktopInstallationId: InstallationId
  mobileInstallationId: InstallationId
  challengeId: PairingChallengeId
  challengeCleanup: CleanupRecord<PairingChallengeState>
  view: PairingCompletionView
  completedAt: number
}

/** Durable pending handshake awaiting a Desktop decision. */
export interface PendingPairingRecord extends CompletionReplayRecord {
  cleanup: CleanupRecord<PendingPairingKey>
  activationCleanup?: CleanupRecord<ActivePairingKey>
}

/** Terminal pending-handshake outcome retained for bounded replay. */
export type PendingOutcome = 'confirmed' | 'rejected' | 'disabled' | 'collision' | 'disposed'
/** Durable terminal pending-handshake transaction. */
export interface SettledPendingRecord {
  accountId: string
  desktopInstallationId: InstallationId
  mobileInstallationId: InstallationId
  outcome: PendingOutcome
  cleanup: CleanupRecord<PendingPairingKey>
  activeCleanup?: CleanupRecord<ActivePairingKey>
  view?: PersonalPairingView
  settledAt: number
}

/** Durable confirmed Personal Pairing plus crypto cleanup ownership. */
export type StoredPersonalPairing = PersonalPairingView & {
  desktopInstallationId: InstallationId
  keyReference: PersonalPairingKeyReference
  cleanup: CleanupRecord<ActivePairingKey>
  mobileGrant?: RelayCredentialGrant
}

/** Provider combining instance-local handshake work with deployment-owned confirmed authority. */
export class PersonalPairingProvider extends RemoteAccessService {
  private transactionState: PersonalPairingTransactionState | undefined
  private serial: Promise<void> = Promise.resolve()
  private readonly clock: { now(): number }
  private readonly randomBytes: (size: number) => Uint8Array
  private readonly randomId: NonNullable<PersonalPairingProviderOptions['randomId']>
  private readonly schedule: NonNullable<PersonalPairingProviderOptions['schedule']>
  private readonly pairingLinkOrigin: string
  private readonly authority: PersonalPairingAuthorityStore
  private readonly ownsAuthority: boolean
  private readonly localChallengeIds = new Set<PairingChallengeId>()

  /** @param ctx - Platform context. @param options - Account, crypto, time, random, and link adapters. */
  constructor(ctx: Context, private readonly options: PersonalPairingProviderOptions) {
    super(ctx)
    const origin = new URL(options.pairingLinkOrigin)
    if (origin.protocol !== 'https:') throw new TypeError('Personal Pairing link origin must use HTTPS')
    if (options.relay !== undefined && options.authority === undefined) {
      throw new TypeError('Remote Relay composition requires a deployment-owned shared authority store')
    }
    this.pairingLinkOrigin = origin.toString()
    this.ownsAuthority = options.authority === undefined
    this.authority = options.authority ?? new MemoryPersonalPairingAuthorityStore()
    this.clock = options.clock ?? { now: () => Date.now() }
    this.randomBytes = options.randomBytes ?? secureRandomBytes
    this.randomId = options.randomId ?? (kind => `${kind}-${crypto.randomUUID()}`)
    this.schedule = options.schedule ?? ((task, delayMs) => setTimeout(task, delayMs))
    ctx.effect(() => async () => { await this.dispose() }, 'remote-access: Personal Pairing resources')
  }

  async createChallenge(input: {
    desktop: PairingAccountAuthentication
    rendezvousId: PairingRendezvousId
  }): Promise<PairingChallengeView> {
    return this.exclusive(async () => {
      const { account, installation } = await this.authenticate(input.desktop, 'desktop')
      this.evictExpiredRecords()
      if (!(await this.authority.getDesktop(account.id, installation.id)).enabled) {
        throw new RemoteAccessError('MOBILE_ACCESS_DISABLED', 'Mobile Access is disabled for this Desktop Installation')
      }
      if (this.countChallenges(account.id, installation.id) >= MAX_ACTIVE_PAIRING_CHALLENGES_PER_INSTALLATION) {
        throw new RemoteAccessError(
          'PAIRING_RESOURCE_LIMIT',
          'This Desktop Installation has reached its active Pairing Challenge limit',
        )
      }
      this.assertRetainedCapacity(account.id, installation.id, 'desktop', 1)
      const invitationSecret = this.randomBytes(32)
      if (invitationSecret.byteLength !== 32) throw new TypeError('Personal Pairing random source must return 32 bytes')
      const expiresAt = this.clock.now() + PAIRING_CHALLENGE_TTL_MS
      const cryptoChallenge = await this.options.handshake.createChallenge({ invitationSecret, expiresAt })
      const cleanup: CleanupRecord<PairingChallengeState> = { resource: cryptoChallenge.state }
      try {
        const challengeId = parsePairingChallengeId(this.randomId('challenge'))
        if (this.challenges.has(challengeId) || this.settledChallenges.has(challengeId)) {
          throw new RemoteAccessError('PAIRING_ID_COLLISION', 'Pairing Challenge id was already allocated')
        }
        const invitation: PairingInvitation = {
          challengeId,
          invitationSecret: invitationSecret.slice(),
          desktopFingerprint: nonEmpty(cryptoChallenge.desktopFingerprint, 'Desktop fingerprint'),
          rendezvousId: parsePairingRendezvousId(input.rendezvousId),
          expiresAt,
          protocolMajor: PERSONAL_PAIRING_PROTOCOL_MAJOR,
        }
        const oneTimeLink = encodePairingInvitationLink(this.pairingLinkOrigin, invitation)
        const timer = this.schedule(() => {
          void this.expireChallenge(challengeId).catch((error: unknown) => {
            console.error('[remote-access] Pairing Challenge expiry cleanup failed:', error)
          })
        }, PAIRING_CHALLENGE_TTL_MS)
        timer.unref()
        const record: ChallengeRecord = {
          invitation,
          accountId: account.id,
          desktopInstallationId: installation.id,
          cleanup,
        }
        this.challenges.set(challengeId, record)
        this.localChallengeIds.add(challengeId)
        return { ...withoutSecret(invitation), oneTimeLink, qrPayload: oneTimeLink }
      } catch (error) {
        await this.cleanupChallenge(cleanup)
        throw error
      } finally {
        invitationSecret.fill(0)
      }
    })
  }

  async getMobileAccessState(desktop: PairingAccountAuthentication): Promise<MobileAccessState> {
    return this.exclusive(async () => {
      const { account, installation } = await this.authenticate(desktop, 'desktop')
      this.evictExpiredRecords()
      const authority = await this.authority.getDesktop(account.id, installation.id)
      return { enabled: authority.enabled }
    })
  }

  async setMobileAccess(input: {
    desktop: PairingAccountAuthentication
    enabled: boolean
  }): Promise<MobileAccessState> {
    return this.exclusive(async () => {
      const { account, installation } = await this.authenticate(input.desktop, 'desktop')
      this.evictExpiredRecords()
      if (input.enabled) {
        const previous = await this.authority.getDesktop(account.id, installation.id)
        let relay: RelayCredentialGrant | undefined
        if (this.options.relay !== undefined) {
          const routeId = await this.authority.enableDesktop(
            account.id,
            installation.id,
            parseRelayRouteId(this.randomId('relay-route')),
          )
          try {
            relay = await this.options.relay.rotateCredential(routeId, 'desktop')
          } catch (error) {
            if (!previous.enabled) {
              try {
                const routeIds = await this.authority.disableDesktop(account.id, installation.id)
                await cleanupAll(routeIds.map(revokingRouteId => async () => {
                  await this.options.relay?.revokeRoute(revokingRouteId)
                  await this.authority.completeRouteRevocation(account.id, installation.id, revokingRouteId)
                }))
              } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'Mobile Access enable rollback failed')
              }
            }
            throw error
          }
        } else {
          await this.authority.enableDesktop(
            account.id,
            installation.id,
            parseRelayRouteId('keyless-no-relay'),
          )
        }
        return { enabled: true, ...(relay === undefined ? {} : { relay }) }
      }
      const routeIds = await this.authority.disableDesktop(account.id, installation.id)
      if (this.options.relay !== undefined) {
        await cleanupAll(routeIds.map(routeId => async () => {
          await this.options.relay?.revokeRoute(routeId)
          await this.authority.completeRouteRevocation(account.id, installation.id, routeId)
        }))
      } else {
        await cleanupAll(routeIds.map(routeId => async () => {
          await this.authority.completeRouteRevocation(account.id, installation.id, routeId)
        }))
      }
      for (const challenge of [...this.challenges.values()]) {
        if (challenge.accountId === account.id && challenge.desktopInstallationId === installation.id) {
          this.settleChallenge(challenge, 'disabled')
        }
      }
      for (const [id, record] of [...this.pending]) {
        if (record.accountId === account.id && record.desktopInstallationId === installation.id) {
          this.settlePending(id, record, 'disabled')
        }
      }
      for (const [pairingId, pairing] of [...this.pairings]) {
        if (pairing.devicePrincipal.accountId === account.id
          && pairing.desktopInstallationId === installation.id) {
          this.pairings.delete(pairingId)
          this.principalIds.delete(pairing.devicePrincipal.id)
          await this.cleanupActive(pairing.cleanup)
          if (pairing.mobileGrant !== undefined) {
            await this.options.relay?.revokeCredential(pairing.mobileGrant)
          }
        }
      }
      await this.cleanupOwner(account.id, installation.id)
      return { enabled: false }
    })
  }

  async reissueDesktopRelayAuthority(desktop: PairingAccountAuthentication): Promise<MobileAccessState> {
    return this.exclusive(async () => {
      const { account, installation } = await this.authenticate(desktop, 'desktop')
      const authority = await this.authority.getDesktop(account.id, installation.id)
      if (!authority.enabled || authority.routeId === undefined) {
        throw new RemoteAccessError('MOBILE_ACCESS_DISABLED', 'Mobile Access is disabled for this Desktop Installation')
      }
      if (this.options.relay === undefined) return { enabled: true }
      return {
        enabled: true,
        relay: await this.options.relay.rotateCredential(authority.routeId, 'desktop'),
      }
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
      const { account, installation } = await this.authenticate(input.mobile, 'mobile')
      this.evictExpiredRecords()
      const completionId = parsePairingCompletionId(input.completionId)
      const invitation = parsePairingInvitationLink(input.oneTimeLink)
      const previous = this.completions.get(completionId)
      if (previous !== undefined) {
        if (previous.accountId !== account.id || previous.mobileInstallationId !== installation.id) {
          throw new RemoteAccessError('PAIRING_CHALLENGE_USED', 'Pairing completion id belongs to another Installation')
        }
        if (previous.challengeId !== invitation.challengeId) {
          throw new RemoteAccessError('PAIRING_ID_COLLISION', 'Pairing completion id was reused for another challenge')
        }
        await this.retryChallengeCleanup(previous.challengeCleanup)
        return cloneCompletion(previous.view)
      }

      let challenge = this.challenges.get(invitation.challengeId)
      if (challenge === undefined) {
        challenge = await this.throwSettledChallenge(invitation.challengeId, account.id)
      }
      if (!sameInvitation(challenge.invitation, invitation)) {
        throw new RemoteAccessError('PAIRING_CHALLENGE_INVALID', 'Pairing invitation is invalid or unavailable')
      }
      if (this.clock.now() >= challenge.invitation.expiresAt) {
        const settled = this.settleChallenge(challenge, 'expired')
        await this.cleanupChallenge(settled.cleanup)
        throw new RemoteAccessError('PAIRING_CHALLENGE_EXPIRED', 'Pairing invitation expired')
      }
      if (challenge.accountId !== account.id) {
        const settled = this.settleChallenge(challenge, 'account-mismatch')
        await this.cleanupChallenge(settled.cleanup)
        throw new RemoteAccessError('PAIRING_ACCOUNT_MISMATCH', 'Desktop and Mobile must use the same Platform Account')
      }
      if (this.countPendingForMobile(account.id, installation.id) >= MAX_PENDING_PAIRINGS_PER_INSTALLATION
        || this.countPendingForDesktop(account.id, challenge.desktopInstallationId)
          >= MAX_PENDING_PAIRINGS_PER_INSTALLATION) {
        throw new RemoteAccessError(
          'PAIRING_RESOURCE_LIMIT',
          'An authenticated Installation has reached its pending Personal Pairing limit',
        )
      }
      this.assertRetainedCapacity(account.id, challenge.desktopInstallationId, 'desktop', 2)
      this.assertRetainedCapacity(account.id, installation.id, 'mobile', 2)

      const completed = await this.options.handshake.completeChallenge({
        invitationSecret: invitation.invitationSecret,
        challengeState: challenge.cleanup.resource as PairingChallengeState,
        mobileHandshake: input.mobileHandshake,
      }).finally(() => { invitation.invitationSecret.fill(0) })
      const pendingCleanup: CleanupRecord<PendingPairingKey> = { resource: completed.pendingPairingKey }
      let view: PairingCompletionView
      try {
        const pendingPairingId = parsePendingPairingId(this.randomId('completion'))
        if (this.pending.has(pendingPairingId) || this.settledPending.has(pendingPairingId)) {
          throw new RemoteAccessError('PAIRING_ID_COLLISION', 'Pending Pairing id was already allocated')
        }
        view = {
          pendingPairingId,
          authenticationWords: deriveAuthenticationWords(completed.handshakeHash),
          desktopHandshake: completed.desktopHandshake.slice(),
          device: parseDevice(input.device),
        }
      } catch (error) {
        this.orphanPendingCleanups.set(pendingCleanup, {
          accountId: account.id,
          desktopInstallationId: challenge.desktopInstallationId,
          mobileInstallationId: installation.id,
          cleanup: pendingCleanup,
        })
        const settled = this.settleChallenge(challenge, 'completed')
        await cleanupAll([
          () => this.cleanupChallenge(settled.cleanup),
          () => this.cleanupPending(pendingCleanup),
        ])
        throw error
      }
      const settled = this.settleChallenge(challenge, 'completed')
      const replay: CompletionReplayRecord = {
        accountId: account.id,
        desktopInstallationId: challenge.desktopInstallationId,
        mobileInstallationId: installation.id,
        challengeId: invitation.challengeId,
        challengeCleanup: settled.cleanup,
        view,
        completedAt: this.clock.now(),
      }
      this.completions.set(completionId, replay)
      this.pending.set(view.pendingPairingId, {
        ...replay,
        desktopInstallationId: challenge.desktopInstallationId,
        cleanup: pendingCleanup,
      })
      await this.cleanupChallenge(settled.cleanup)
      return cloneCompletion(view)
    })
  }

  async listPersonalPairings(desktop: PairingAccountAuthentication): Promise<readonly PersonalPairingView[]> {
    return this.exclusive(async () => {
      const { account, installation } = await this.authenticate(desktop, 'desktop')
      this.evictExpiredRecords()
      return [...this.pairings.values()]
        .filter(pairing => pairing.devicePrincipal.accountId === account.id
          && pairing.desktopInstallationId === installation.id)
        .map(clonePairing)
    })
  }

  async revokePersonalPairing(input: {
    desktop: PairingAccountAuthentication
    pairingId: PersonalPairingId
  }): Promise<void> {
    await this.exclusive(async () => {
      const { account, installation } = await this.authenticate(input.desktop, 'desktop')
      this.evictExpiredRecords()
      const pairingId = parsePersonalPairingId(input.pairingId)
      const pairing = this.pairings.get(pairingId)
      if (pairing === undefined
        || pairing.devicePrincipal.accountId !== account.id
        || pairing.desktopInstallationId !== installation.id) {
        throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Personal Pairing is invalid or unavailable')
      }
      this.pairings.delete(pairingId)
      this.principalIds.delete(pairing.devicePrincipal.id)
      const operations: Array<() => Promise<void>> = [
        () => this.cleanupActive(pairing.cleanup),
        () => this.authority.revokeMobilePairing(pairingId),
      ]
      if (pairing.mobileGrant !== undefined && this.options.relay !== undefined) {
        const grant = pairing.mobileGrant
        operations.push(async () => { await this.options.relay?.revokeCredential(grant) })
      }
      await cleanupAll(operations)
    })
  }

  async getMobilePairingStatus(input: {
    mobile: PairingAccountAuthentication
    pendingPairingId: PendingPairingId
  }): Promise<MobilePairingStatus> {
    return this.exclusive(async () => {
      const { account, installation } = await this.authenticate(input.mobile, 'mobile')
      this.evictExpiredRecords()
      const pendingPairingId = parsePendingPairingId(input.pendingPairingId)
      const pending = this.pending.get(pendingPairingId)
      if (pending !== undefined) {
        if (pending.accountId === account.id && pending.mobileInstallationId === installation.id) {
          return { status: 'pending' }
        }
        throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Pending Pairing is invalid or unavailable')
      }
      const settled = this.settledPending.get(pendingPairingId)
      if (settled === undefined || settled.accountId !== account.id
        || settled.mobileInstallationId !== installation.id) {
        const authority = await this.authority.getMobilePairing(pendingPairingId)
        if (authority !== undefined && authority.accountId === account.id
          && authority.mobileInstallationId === installation.id) {
          return {
            status: 'paired',
            pairingId: authority.pairingId,
            ...(authority.sealedRelayAuthority === undefined
              ? {}
              : { sealedRelayAuthority: authority.sealedRelayAuthority.slice() }),
          }
        }
        throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Pending Pairing is invalid or unavailable')
      }
      if (settled.outcome === 'confirmed' && settled.view !== undefined) {
        const authority = await this.authority.getMobilePairing(pendingPairingId)
        if (authority === undefined) return { status: 'rejected' }
        return {
          status: 'paired', pairingId: settled.view.id,
          ...(authority.sealedRelayAuthority === undefined
            ? {}
            : { sealedRelayAuthority: authority.sealedRelayAuthority.slice() }),
        }
      }
      return { status: 'rejected' }
    })
  }

  async listPendingPairings(desktop: PairingAccountAuthentication): Promise<readonly PairingCompletionView[]> {
    return this.exclusive(async () => {
      const { account, installation } = await this.authenticate(desktop, 'desktop')
      this.evictExpiredRecords()
      return [...this.pending.values()]
        .filter(record => record.accountId === account.id && record.desktopInstallationId === installation.id)
        .map(record => cloneCompletion(record.view))
    })
  }

  async confirmPairing(input: {
    desktop: PairingAccountAuthentication
    pendingPairingId: PendingPairingId
  }): Promise<PersonalPairingView> {
    return this.exclusive(async () => {
      const { account, installation } = await this.authenticate(input.desktop, 'desktop')
      this.evictExpiredRecords()
      const pendingPairingId = parsePendingPairingId(input.pendingPairingId)
      const settled = this.settledPending.get(pendingPairingId)
      if (settled !== undefined) {
        if (settled.accountId === account.id && settled.desktopInstallationId === installation.id
          && settled.outcome === 'collision') {
          await this.cleanupSettledPending(settled)
          throw new RemoteAccessError('PAIRING_ID_COLLISION', 'Personal Pairing identity was already allocated')
        }
        if (settled.accountId !== account.id || settled.desktopInstallationId !== installation.id
          || settled.outcome !== 'confirmed' || settled.view === undefined) {
          throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Pending Pairing is invalid or unavailable')
        }
        await this.cleanupPending(settled.cleanup)
        return clonePairing(settled.view)
      }
      const record = this.requirePending(pendingPairingId, account.id, installation.id)
      await this.cleanupPendingActivation(record)
      const activation = await this.options.handshake.activatePairing({
        pendingPairingKey: record.cleanup.resource as PendingPairingKey,
      })
      const activationCleanup: CleanupRecord<ActivePairingKey> = { resource: activation.activePairingKey }
      record.activationCleanup = activationCleanup
      try {
        const keyReference = parsePersonalPairingKeyReference(activation.keyReference)
        if ([...this.pairings.values()].some(pairing => pairing.keyReference === keyReference)) {
          const collision = this.settlePending(pendingPairingId, record, 'collision')
          await this.cleanupSettledPending(collision)
          throw new RemoteAccessError('PAIRING_ID_COLLISION', 'Personal Pairing key reference was already allocated')
        }
        const pairingId = parsePersonalPairingId(this.randomId('pairing'))
        const principalId = parseDevicePrincipalId(this.randomId('principal'))
        if (this.pairings.has(pairingId) || this.principalIds.has(principalId)) {
          const collision = this.settlePending(pendingPairingId, record, 'collision')
          await this.cleanupSettledPending(collision)
          throw new RemoteAccessError('PAIRING_ID_COLLISION', 'Personal Pairing identity was already allocated')
        }
        const view: PersonalPairingView = {
          id: pairingId,
          devicePrincipal: {
            id: principalId,
            accountId: account.id,
            installationId: record.mobileInstallationId,
            authority: 'companion-surface',
          },
          device: { ...record.view.device },
          pairedAt: this.clock.now(),
          lastAccessAt: this.clock.now(),
          online: false,
        }
        let sealedRelayAuthority: Uint8Array | undefined
        let issuedMobileGrant: RelayCredentialGrant | undefined
        const desktopAuthority = await this.authority.getDesktop(account.id, record.desktopInstallationId)
        if (this.options.relay !== undefined) {
          if (!desktopAuthority.enabled || desktopAuthority.routeId === undefined) {
            throw new RemoteAccessError('MOBILE_ACCESS_DISABLED', 'Mobile Access is disabled for this Desktop Installation')
          }
          if (this.options.handshake.sealMobileRelayAuthority === undefined) {
            throw new Error('Personal Pairing crypto adapter cannot seal Mobile Relay authority')
          }
          const mobileGrant = await this.options.relay.issueCredential(desktopAuthority.routeId, 'mobile')
          issuedMobileGrant = mobileGrant
          try {
            sealedRelayAuthority = await this.options.handshake.sealMobileRelayAuthority({
              activePairingKey: activation.activePairingKey,
              grant: mobileGrant,
            })
          } catch (error) {
            try {
              await this.options.relay.revokeCredential(mobileGrant)
            } catch (cleanupError) {
              throw new AggregateError([error, cleanupError], 'Mobile Relay authority rollback failed')
            }
            throw error
          }
        }
        try {
          await this.authority.confirmMobilePairing({
            accountId: account.id,
            desktopInstallationId: record.desktopInstallationId,
            mobileInstallationId: record.mobileInstallationId,
            pendingPairingId,
            pairingId: view.id,
            ...(sealedRelayAuthority === undefined ? {} : { sealedRelayAuthority }),
          })
        } catch (error) {
          if (issuedMobileGrant !== undefined && this.options.relay !== undefined) {
            try {
              await this.options.relay.revokeCredential(issuedMobileGrant)
            } catch (cleanupError) {
              throw new AggregateError([error, cleanupError], 'Mobile Relay authority commit rollback failed')
            }
          }
          throw error
        }
        this.principalIds.add(principalId)
        this.pairings.set(view.id, {
          ...view,
          desktopInstallationId: record.desktopInstallationId,
          keyReference,
          cleanup: activationCleanup,
          ...(issuedMobileGrant === undefined ? {} : { mobileGrant: issuedMobileGrant }),
        })
        delete record.activationCleanup
        const confirmed = this.settlePending(pendingPairingId, record, 'confirmed', view)
        await this.cleanupPending(confirmed.cleanup)
        return clonePairing(view)
      } catch (error) {
        if (this.pending.get(pendingPairingId) === record) {
          try {
            await this.cleanupPendingActivation(record)
          } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], 'Personal Pairing activation rollback failed')
          }
        }
        throw error
      }
    })
  }

  async cancelChallenge(input: {
    desktop: PairingAccountAuthentication
    challengeId: PairingChallengeId
  }): Promise<void> {
    await this.exclusive(async () => {
      const { account, installation } = await this.authenticate(input.desktop, 'desktop')
      this.evictExpiredRecords()
      const challengeId = parsePairingChallengeId(input.challengeId)
      const previous = this.settledChallenges.get(challengeId)
      if (previous !== undefined) {
        if (previous.accountId !== account.id || previous.desktopInstallationId !== installation.id
          || (previous.outcome !== 'cancelled' && previous.outcome !== 'disabled')) {
          throw new RemoteAccessError('PAIRING_CHALLENGE_INVALID', 'Pairing Challenge is invalid or unavailable')
        }
        await this.cleanupChallenge(previous.cleanup)
        return
      }
      const challenge = this.challenges.get(challengeId)
      if (challenge === undefined || challenge.accountId !== account.id
        || challenge.desktopInstallationId !== installation.id) {
        throw new RemoteAccessError('PAIRING_CHALLENGE_INVALID', 'Pairing Challenge is invalid or unavailable')
      }
      const settled = this.settleChallenge(challenge, 'cancelled')
      await this.cleanupChallenge(settled.cleanup)
    })
  }

  async rejectPairing(input: {
    desktop: PairingAccountAuthentication
    pendingPairingId: PendingPairingId
  }): Promise<void> {
    await this.exclusive(async () => {
      const { account, installation } = await this.authenticate(input.desktop, 'desktop')
      this.evictExpiredRecords()
      const pendingPairingId = parsePendingPairingId(input.pendingPairingId)
      const previous = this.settledPending.get(pendingPairingId)
      if (previous !== undefined) {
        if (previous.accountId !== account.id || previous.desktopInstallationId !== installation.id
          || (previous.outcome !== 'rejected' && previous.outcome !== 'disabled')) {
          throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Pending Pairing is invalid or unavailable')
        }
        await this.cleanupPending(previous.cleanup)
        return
      }
      const record = this.requirePending(pendingPairingId, account.id, installation.id)
      const settled = this.settlePending(pendingPairingId, record, 'rejected')
      await this.cleanupPending(settled.cleanup)
    })
  }

  /** Drain instance-local incomplete crypto work while preserving durable confirmed authority. */
  async dispose(): Promise<void> {
    if (!this.ownsAuthority) {
      await this.exclusive(async () => {
        const operations: Array<() => Promise<void>> = []
        for (const challengeId of [...this.localChallengeIds]) {
          const challenge = this.challenges.get(challengeId)
          if (challenge !== undefined) {
            const settled = this.settleChallenge(challenge, 'disposed')
            operations.push(() => this.cleanupChallenge(settled.cleanup))
          }
          this.localChallengeIds.delete(challengeId)
        }
        await cleanupAll(operations)
      })
      return
    }
    await this.exclusive(async () => {
      for (const challenge of [...this.challenges.values()]) this.settleChallenge(challenge, 'disposed')
      for (const [id, record] of [...this.pending]) this.settlePending(id, record, 'disposed')
      const operations: Array<() => Promise<void>> = []
      for (const record of this.settledChallenges.values()) operations.push(() => this.cleanupChallenge(record.cleanup))
      for (const record of this.settledPending.values()) operations.push(() => this.cleanupSettledPending(record))
      for (const record of this.orphanPendingCleanups.values()) {
        operations.push(() => this.cleanupPending(record.cleanup))
      }
      await cleanupAll(operations)
    })
  }

  private expireChallenge(challengeId: PairingChallengeId): Promise<void> {
    return this.exclusive(async () => {
      const challenge = this.challenges.get(challengeId)
      if (challenge === undefined || this.clock.now() < challenge.invitation.expiresAt) return
      const settled = this.settleChallenge(challenge, 'expired')
      await this.cleanupChallenge(settled.cleanup)
    })
  }

  private settleChallenge(challenge: ChallengeRecord, outcome: ChallengeOutcome): SettledChallengeRecord {
    this.challenges.delete(challenge.invitation.challengeId)
    this.localChallengeIds.delete(challenge.invitation.challengeId)
    challenge.invitation.invitationSecret.fill(0)
    const settled = {
      accountId: challenge.accountId,
      desktopInstallationId: challenge.desktopInstallationId,
      outcome,
      cleanup: challenge.cleanup,
      settledAt: this.clock.now(),
    }
    this.settledChallenges.set(challenge.invitation.challengeId, settled)
    return settled
  }

  private settlePending(
    id: PendingPairingId,
    record: PendingPairingRecord,
    outcome: PendingOutcome,
    view?: PersonalPairingView,
    activeCleanup?: CleanupRecord<ActivePairingKey>,
  ): SettledPendingRecord {
    this.pending.delete(id)
    const ownedActiveCleanup = activeCleanup ?? record.activationCleanup
    const settled = {
      accountId: record.accountId,
      desktopInstallationId: record.desktopInstallationId,
      mobileInstallationId: record.mobileInstallationId,
      outcome,
      cleanup: record.cleanup,
      ...(ownedActiveCleanup === undefined ? {} : { activeCleanup: ownedActiveCleanup }),
      ...(view === undefined ? {} : { view }),
      settledAt: this.clock.now(),
    }
    this.settledPending.set(id, settled)
    return settled
  }

  private requirePending(id: PendingPairingId, accountId: string, installationId: InstallationId): PendingPairingRecord {
    const record = this.pending.get(id)
    if (record === undefined || record.accountId !== accountId || record.desktopInstallationId !== installationId) {
      throw new RemoteAccessError('PAIRING_PENDING_INVALID', 'Pending Pairing is invalid or unavailable')
    }
    return record
  }

  private async throwSettledChallenge(challengeId: PairingChallengeId, accountId: string): Promise<never> {
    const settled = this.settledChallenges.get(challengeId)
    if (settled === undefined) {
      throw new RemoteAccessError('PAIRING_CHALLENGE_INVALID', 'Pairing invitation is invalid or unavailable')
    }
    await this.cleanupChallenge(settled.cleanup)
    if (settled.outcome === 'expired') {
      throw new RemoteAccessError('PAIRING_CHALLENGE_EXPIRED', 'Pairing invitation expired')
    }
    if (settled.outcome === 'account-mismatch' && settled.accountId !== accountId) {
      throw new RemoteAccessError('PAIRING_ACCOUNT_MISMATCH', 'Desktop and Mobile must use the same Platform Account')
    }
    throw new RemoteAccessError('PAIRING_CHALLENGE_INVALID', 'Pairing invitation is invalid or unavailable')
  }

  private async retryChallengeCleanup(cleanup: CleanupRecord<PairingChallengeState>): Promise<void> {
    await this.cleanupChallenge(cleanup)
  }

  private async cleanupOwner(accountId: string, installationId: InstallationId): Promise<void> {
    const operations: Array<() => Promise<void>> = []
    for (const record of this.settledChallenges.values()) {
      if (record.accountId === accountId && record.desktopInstallationId === installationId) {
        operations.push(() => this.cleanupChallenge(record.cleanup))
      }
    }
    for (const record of this.settledPending.values()) {
      if (record.accountId === accountId && record.desktopInstallationId === installationId) {
        operations.push(() => this.cleanupSettledPending(record))
      }
    }
    for (const record of this.orphanPendingCleanups.values()) {
      if (record.accountId === accountId && record.desktopInstallationId === installationId) {
        operations.push(() => this.cleanupPending(record.cleanup))
      }
    }
    await cleanupAll(operations)
  }

  private countChallenges(accountId: string, installationId: InstallationId): number {
    return [...this.challenges.values()].filter(record => record.accountId === accountId
      && record.desktopInstallationId === installationId).length
  }

  private countPendingForDesktop(accountId: string, installationId: InstallationId): number {
    return [...this.pending.values()].filter(record => record.accountId === accountId
      && record.desktopInstallationId === installationId).length
  }

  private countPendingForMobile(accountId: string, installationId: InstallationId): number {
    return [...this.pending.values()].filter(record => record.accountId === accountId
      && record.mobileInstallationId === installationId).length
  }

  private countRetainedRecords(
    accountId: string,
    installationId: InstallationId,
    kind: 'desktop' | 'mobile',
  ): number {
    const owns = (record: { accountId: string; desktopInstallationId: InstallationId; mobileInstallationId?: InstallationId }) =>
      record.accountId === accountId
        && (kind === 'desktop'
          ? record.desktopInstallationId === installationId
          : record.mobileInstallationId === installationId)
    let count = 0
    if (kind === 'desktop') {
      count += [...this.challenges.values()].filter(owns).length
      count += [...this.settledChallenges.values()].filter(owns).length
    }
    count += [...this.completions.values()].filter(owns).length
    count += [...this.pending.values()].filter(owns).length
    count += [...this.settledPending.values()].filter(owns).length
    count += [...this.orphanPendingCleanups.values()].filter(owns).length
    return count
  }

  private assertRetainedCapacity(
    accountId: string,
    installationId: InstallationId,
    kind: 'desktop' | 'mobile',
    additionalRecords: number,
  ): void {
    if (this.countRetainedRecords(accountId, installationId, kind) + additionalRecords
      > MAX_RETAINED_PAIRING_RECORDS_PER_INSTALLATION) {
      throw new RemoteAccessError(
        'PAIRING_RESOURCE_LIMIT',
        `This ${kind} Installation has reached its retained Personal Pairing record limit`,
      )
    }
  }

  private evictExpiredRecords(): void {
    const cutoff = this.clock.now() - PAIRING_REPLAY_RETENTION_MS
    for (const [id, record] of this.settledChallenges) {
      if (record.settledAt <= cutoff && record.cleanup.resource === undefined) this.settledChallenges.delete(id)
    }
    for (const [id, record] of this.completions) {
      if (record.completedAt <= cutoff && record.challengeCleanup.resource === undefined) this.completions.delete(id)
    }
    for (const [id, record] of this.settledPending) {
      if (record.settledAt <= cutoff && record.cleanup.resource === undefined
        && record.activeCleanup?.resource === undefined) this.settledPending.delete(id)
    }
  }

  private cleanupChallenge(cleanup: CleanupRecord<PairingChallengeState>): Promise<void> {
    return cleanupResource(cleanup, state => this.options.handshake.destroyChallenge(state))
  }

  private async cleanupPending(cleanup: CleanupRecord<PendingPairingKey>): Promise<void> {
    await cleanupResource(cleanup, state => this.options.handshake.destroyPendingPairing(state))
    this.orphanPendingCleanups.delete(cleanup)
  }

  private cleanupSettledPending(record: SettledPendingRecord): Promise<void> {
    const operations: Array<() => Promise<void>> = [() => this.cleanupPending(record.cleanup)]
    const activeCleanup = record.activeCleanup
    if (activeCleanup !== undefined) operations.push(() => this.cleanupActive(activeCleanup))
    return cleanupAll(operations)
  }

  private async cleanupPendingActivation(record: PendingPairingRecord): Promise<void> {
    const cleanup = record.activationCleanup
    if (cleanup === undefined) return
    await this.cleanupActive(cleanup)
    delete record.activationCleanup
  }

  private cleanupActive(cleanup: CleanupRecord<ActivePairingKey>): Promise<void> {
    return cleanupResource(cleanup, activePairingKey => this.options.handshake.destroyPairing(activePairingKey))
  }

  private async authenticate(
    authentication: PairingAccountAuthentication,
    expectedKind: 'desktop' | 'mobile',
  ): Promise<AuthenticatedInstallationView> {
    const authenticated = await this.options.account.currentInstallation({
      accessToken: authentication.accessToken,
      proof: authentication.proof,
    })
    if (authenticated.installation.kind !== expectedKind) {
      throw new RemoteAccessError(
        'PAIRING_INSTALLATION_KIND_INVALID',
        `Personal Pairing operation requires an authenticated ${expectedKind} Installation`,
      )
    }
    return authenticated
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const owned = async (): Promise<T> => await this.authority.runPairingTransaction(async (state) => {
      this.transactionState = state
      try {
        return await operation()
      } finally {
        this.transactionState = undefined
      }
    })
    const result = this.serial.then(owned, owned)
    this.serial = result.then(() => undefined, () => undefined)
    return result
  }

  private get challenges(): PersonalPairingTransactionState['challenges'] { return this.requireTransactions().challenges }
  private get settledChallenges(): PersonalPairingTransactionState['settledChallenges'] {
    return this.requireTransactions().settledChallenges
  }
  private get completions(): PersonalPairingTransactionState['completions'] { return this.requireTransactions().completions }
  private get pending(): PersonalPairingTransactionState['pending'] { return this.requireTransactions().pending }
  private get settledPending(): PersonalPairingTransactionState['settledPending'] {
    return this.requireTransactions().settledPending
  }
  private get pairings(): PersonalPairingTransactionState['pairings'] { return this.requireTransactions().pairings }
  private get principalIds(): PersonalPairingTransactionState['principalIds'] { return this.requireTransactions().principalIds }
  private get orphanPendingCleanups(): PersonalPairingTransactionState['orphanPendingCleanups'] {
    return this.requireTransactions().orphanPendingCleanups
  }

  private requireTransactions(): PersonalPairingTransactionState {
    if (this.transactionState === undefined) throw new Error('Personal Pairing transaction state is not owned')
    return this.transactionState
  }
}

function createPairingTransactionState(): PersonalPairingTransactionState {
  return {
    challenges: new Map(),
    settledChallenges: new Map(),
    completions: new Map(),
    pending: new Map(),
    settledPending: new Map(),
    pairings: new Map(),
    principalIds: new Set(),
    orphanPendingCleanups: new Map(),
  }
}

async function cleanupResource<T>(
  cleanup: CleanupRecord<T>,
  destroy: (resource: T) => void | Promise<void>,
): Promise<void> {
  const resource = cleanup.resource
  if (resource === undefined) return
  await destroy(resource)
  delete cleanup.resource
}

async function cleanupAll(operations: readonly (() => Promise<void>)[]): Promise<void> {
  const results = await Promise.allSettled(operations.map(operation => operation()))
  const errors: unknown[] = []
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason as unknown)
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Personal Pairing resource cleanup failed')
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
 * Parse a provider key reference at a crypto or durable boundary.
 * @param value - untrusted provider reference.
 * @returns branded non-empty Personal Pairing key reference.
 */
export function parsePersonalPairingKeyReference(value: unknown): PersonalPairingKeyReference {
  return nonEmpty(value, 'Personal Pairing key reference') as PersonalPairingKeyReference
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
    lastAccessAt: view.lastAccessAt,
    online: view.online,
  }
}

function cloneMobileAuthority(authority: MobilePairingAuthority): MobilePairingAuthority {
  return {
    ...authority,
    ...(authority.sealedRelayAuthority === undefined
      ? {}
      : { sealedRelayAuthority: authority.sealedRelayAuthority.slice() }),
  }
}

function sameMobileAuthority(left: MobilePairingAuthority, right: MobilePairingAuthority): boolean {
  return left.accountId === right.accountId
    && left.desktopInstallationId === right.desktopInstallationId
    && left.mobileInstallationId === right.mobileInstallationId
    && left.pendingPairingId === right.pendingPairingId
    && left.pairingId === right.pairingId
    && bytesEqual(left.sealedRelayAuthority, right.sealedRelayAuthority)
}

function bytesEqual(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
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
