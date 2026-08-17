/** Desktop Host ownership of the current-installation Platform Account state. */

import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
  sign,
} from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  AccountProof,
  AccountSessionView,
  LoginAttemptView,
  LoginPollResult,
  PlatformEnvironment,
} from '@deepseek-ai/dsh-platform-account'
import type { PlatformAccountTransport } from '@deepseek-ai/dsh-platform-account-client'
import type { DesktopAccountSnapshot } from '@deepseek-ai/dsh-client-ui-desktop/protocol'

/** Entire encrypted Account record; account-scoped pairing material lives elsewhere. */
export interface PersistedDesktopAccount {
  installationId: string
  session?: AccountSessionView
  sessionPrivateKey?: string
  pending?: LoginAttemptView
  pendingPrivateKey?: string
}

/** Encryption operations supplied by Electron safeStorage. */
export interface DesktopAccountProtection {
  encrypt(value: string): Uint8Array
  decrypt(value: Uint8Array): string
}

/** Protected Desktop account-record persistence. */
export interface DesktopAccountStore {
  load(): Promise<PersistedDesktopAccount | undefined>
  save(record: PersistedDesktopAccount): Promise<void>
}

/** Encrypted, atomically replaced Desktop Account record. */
export class EncryptedDesktopAccountStore implements DesktopAccountStore {
  /** @param path - environment-specific file under Electron userData. */
  constructor(
    private readonly path: string,
    private readonly protection: DesktopAccountProtection,
  ) {}

  async load(): Promise<PersistedDesktopAccount | undefined> {
    let bytes: Buffer
    try {
      bytes = await readFile(this.path)
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return undefined
      throw error
    }
    const value = JSON.parse(this.protection.decrypt(bytes)) as unknown
    if (!isPersistedDesktopAccount(value)) throw new Error('Desktop Platform Account record is invalid')
    return value
  }

  async save(record: PersistedDesktopAccount): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${process.pid}.tmp`
    await writeFile(temporary, this.protection.encrypt(JSON.stringify(record)), { mode: 0o600 })
    await rename(temporary, this.path)
  }
}

/** Desktop controller construction inputs. */
export interface DesktopAccountControllerOptions {
  environment: PlatformEnvironment
  transport: PlatformAccountTransport
  store: DesktopAccountStore
  openSystemBrowser: (url: string) => Promise<void>
  now?: () => number
  schedule?: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
}

/** Desktop Host Account operations exposed through the preload bridge. */
export interface DesktopAccountActions {
  getSnapshot(): DesktopAccountSnapshot
  acceptPrivacy(): Promise<DesktopAccountSnapshot>
  beginLogin(): Promise<DesktopAccountSnapshot>
  signOut(): Promise<DesktopAccountSnapshot>
  subscribe(listener: (snapshot: DesktopAccountSnapshot) => void): () => void
  start(): Promise<void>
  dispose(): void
}

/** Account lifecycle whose private signing key never enters the renderer. */
export class DesktopAccountController implements DesktopAccountActions {
  private snapshot: DesktopAccountSnapshot = { status: 'idle', privacyAccepted: false }
  private record: PersistedDesktopAccount | undefined
  private readonly listeners = new Set<(snapshot: DesktopAccountSnapshot) => void>()
  private readonly now: () => number
  private readonly schedule: (task: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  /** @param options - trusted transport, protected storage, system browser, and timing adapters. */
  constructor(private readonly options: DesktopAccountControllerOptions) {
    this.now = options.now ?? Date.now
    this.schedule = options.schedule ?? setTimeout
  }

  getSnapshot(): DesktopAccountSnapshot {
    return this.snapshot
  }

  subscribe(listener: (snapshot: DesktopAccountSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async start(): Promise<void> {
    this.record = await this.options.store.load() ?? { installationId: randomUUID() }
    await this.options.store.save(this.record)
    if (this.record.pending !== undefined) {
      if (this.record.pending.expiresAt > this.now() && this.record.pendingPrivateKey !== undefined) {
        this.publish({ status: 'polling', privacyAccepted: false })
        this.schedulePoll()
      } else {
        delete this.record.pending
        delete this.record.pendingPrivateKey
        await this.options.store.save(this.record)
      }
    }
    await this.restoreSession()
  }

  acceptPrivacy(): Promise<DesktopAccountSnapshot> {
    this.publish({ ...withoutDesktopError(this.snapshot), privacyAccepted: true })
    return Promise.resolve(this.snapshot)
  }

  async beginLogin(): Promise<DesktopAccountSnapshot> {
    if (!this.snapshot.privacyAccepted) throw new Error('privacy notice must be accepted before authorization')
    const record = this.requireRecord()
    this.publish({ status: 'authorizing', privacyAccepted: true })
    try {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      const attempt = await this.options.transport.beginLogin({
        installationId: record.installationId,
        installationKind: 'desktop',
        publicKey: publicKey.export({ format: 'jwk' }),
      })
      record.pending = attempt
      record.pendingPrivateKey = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
      await this.options.store.save(record)
      await this.options.openSystemBrowser(attempt.authorizationUrl)
      this.publish({ status: 'polling', privacyAccepted: true })
      this.schedulePoll()
    } catch (error) {
      this.fail(error)
      throw error
    }
    return this.snapshot
  }

  async signOut(): Promise<DesktopAccountSnapshot> {
    const record = this.requireRecord()
    if (record.session === undefined || record.sessionPrivateKey === undefined) return this.snapshot
    this.publish({ ...withoutDesktopError(this.snapshot), status: 'signing-out' })
    try {
      await this.options.transport.signOut({
        accessToken: record.session.accessToken,
        proof: desktopProof(record.sessionPrivateKey, 'sign-out', hash(record.session.accessToken), this.now()),
      })
    } catch (error) {
      if (!isTerminalSessionError(error)) {
        this.fail(error)
        throw error
      }
    }
    delete record.session
    delete record.sessionPrivateKey
    await this.options.store.save(record)
    this.publish({ status: 'idle', privacyAccepted: this.snapshot.privacyAccepted })
    return this.snapshot
  }

  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.listeners.clear()
  }

  private async restoreSession(): Promise<void> {
    const record = this.requireRecord()
    if (record.session === undefined || record.sessionPrivateKey === undefined) return
    if (record.session.refreshExpiresAt <= this.now()) {
      await this.clearSession(record)
      return
    }
    try {
      if (record.session.accessExpiresAt <= this.now()) {
        record.session = await this.options.transport.refresh({
          refreshToken: record.session.refreshToken,
          proof: desktopProof(record.sessionPrivateKey, 'refresh', hash(record.session.refreshToken), this.now()),
        })
      } else {
        const account = await this.options.transport.current({
          accessToken: record.session.accessToken,
          proof: desktopProof(record.sessionPrivateKey, 'current', hash(record.session.accessToken), this.now()),
        })
        record.session = { ...record.session, account }
      }
      await this.options.store.save(record)
      this.publish({ status: 'signed-in', privacyAccepted: this.snapshot.privacyAccepted, account: record.session.account })
    } catch (error) {
      if (isTerminalSessionError(error)) {
        await this.clearSession(record)
        return
      }
      this.fail(error)
    }
  }

  private schedulePoll(): void {
    if (this.disposed || this.timer !== undefined) return
    this.timer = this.schedule(() => {
      this.timer = undefined
      void this.poll().catch(() => {})
    }, 1_500)
    this.timer.unref()
  }

  private async poll(): Promise<void> {
    const record = this.requireRecord()
    if (record.pending === undefined || record.pendingPrivateKey === undefined) return
    if (record.pending.expiresAt <= this.now()) {
      delete record.pending
      delete record.pendingPrivateKey
      await this.options.store.save(record)
      this.fail(new Error('GitHub authorization expired'))
      return
    }
    try {
      const result: LoginPollResult = await this.options.transport.pollLogin({
        attemptId: record.pending.id,
        pollingToken: record.pending.pollingToken,
        proof: desktopProof(
          record.pendingPrivateKey,
          'login-poll',
          `${record.pending.id}:${hash(record.pending.pollingToken)}`,
          this.now(),
        ),
      })
      if (result.status === 'pending') {
        this.schedulePoll()
        return
      }
      record.session = result
      record.sessionPrivateKey = record.pendingPrivateKey
      delete record.pending
      delete record.pendingPrivateKey
      await this.options.store.save(record)
      this.publish({ status: 'signed-in', privacyAccepted: true, account: result.account })
    } catch (error) {
      this.fail(error)
    }
  }

  private async clearSession(record: PersistedDesktopAccount): Promise<void> {
    delete record.session
    delete record.sessionPrivateKey
    await this.options.store.save(record)
    this.publish({ status: 'idle', privacyAccepted: this.snapshot.privacyAccepted })
  }

  private requireRecord(): PersistedDesktopAccount {
    if (this.record === undefined) throw new Error('Desktop Platform Account has not started')
    return this.record
  }

  private fail(error: unknown): void {
    this.publish({
      ...this.snapshot,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  private publish(snapshot: DesktopAccountSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener(snapshot)
  }
}

/** Disabled Account lifecycle for unconfigured or encryption-incapable Desktop hosts. */
export class UnavailableDesktopAccountController implements DesktopAccountActions {
  private readonly snapshot: DesktopAccountSnapshot

  /** @param reason - non-secret setup or platform-capability explanation. */
  constructor(reason: string) {
    this.snapshot = { status: 'unavailable', privacyAccepted: false, error: reason }
  }

  getSnapshot(): DesktopAccountSnapshot { return this.snapshot }
  acceptPrivacy(): Promise<DesktopAccountSnapshot> { return Promise.resolve(this.snapshot) }
  beginLogin(): Promise<DesktopAccountSnapshot> { return Promise.resolve(this.snapshot) }
  signOut(): Promise<DesktopAccountSnapshot> { return Promise.resolve(this.snapshot) }
  subscribe(): () => void { return () => {} }
  start(): Promise<void> { return Promise.resolve() }
  dispose(): void {}
}

function desktopProof(privateKey: string, operation: string, binding: string, issuedAt: number): AccountProof {
  const jti = randomUUID()
  const payload = Buffer.from(`${operation}\n${binding}\n${issuedAt}\n${jti}`, 'utf8')
  return {
    jti,
    issuedAt,
    signature: sign('sha256', payload, {
      key: createPrivateKey(privateKey),
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url'),
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function withoutDesktopError(snapshot: DesktopAccountSnapshot): DesktopAccountSnapshot {
  return {
    status: snapshot.status,
    privacyAccepted: snapshot.privacyAccepted,
    ...(snapshot.account === undefined ? {} : { account: snapshot.account }),
  }
}

function isTerminalSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.startsWith('SESSION_REVOKED:') || error.message.startsWith('SESSION_EXPIRED:')
}

function isPersistedDesktopAccount(value: unknown): value is PersistedDesktopAccount {
  if (typeof value !== 'object' || value === null || !('installationId' in value)) return false
  return typeof value.installationId === 'string' && value.installationId !== ''
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
