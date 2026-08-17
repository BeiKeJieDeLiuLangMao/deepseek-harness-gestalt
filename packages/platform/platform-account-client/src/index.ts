/**
 * Desktop/Mobile installation client for Platform Account login, proof, refresh,
 * account-scoped local state, and current-installation sign-out.
 * @module @deepseek-ai/dsh-platform-account-client
 */

import {
  ACCOUNT_PRIVACY_NOTICE,
  type AccountProof,
  type AccountSessionView,
  type InstallationKind,
  type LoginAttemptView,
  type LoginPollResult,
  type PlatformAccountId,
  type PlatformAccountView,
  type PlatformEnvironment,
} from '@deepseek-ai/dsh-platform-account'

export { ACCOUNT_PRIVACY_NOTICE }

/** Transport operations used by one installation controller. */
export interface PlatformAccountTransport {
  beginLogin(input: {
    installationId: string
    installationKind: InstallationKind
    publicKey: JsonWebKey
  }): Promise<LoginAttemptView>
  pollLogin(input: { attemptId: string; pollingToken: string; proof: AccountProof }): Promise<LoginPollResult>
  refresh(input: { refreshToken: string; proof: AccountProof }): Promise<AccountSessionView>
  current(input: { accessToken: string; proof: AccountProof }): Promise<PlatformAccountView>
  signOut(input: { accessToken: string; proof: AccountProof }): Promise<void>
}

/** Trusted Platform origins compiled for the two supported environments. */
export interface PlatformOrigins {
  development: string
  production: string
}

/** HTTP transport construction inputs. */
export interface PlatformAccountHttpTransportOptions {
  environment: PlatformEnvironment
  origins: PlatformOrigins
  fetch?: typeof fetch
}

/** Browser/native HTTP transport for the public Account routes. */
export class PlatformAccountHttpTransport implements PlatformAccountTransport {
  private readonly origin: string
  private readonly fetch: typeof fetch

  /** @param options - build-owned environment/origin set and HTTP adapter. */
  constructor(options: PlatformAccountHttpTransportOptions) {
    const development = new URL(options.origins.development)
    const production = new URL(options.origins.production)
    if (development.protocol !== 'https:' || production.protocol !== 'https:'
      || development.origin === production.origin) {
      throw new TypeError('Platform Account origins must be distinct HTTPS origins')
    }
    this.origin = options.environment === 'development' ? development.origin : production.origin
    this.fetch = options.fetch ?? globalThis.fetch
  }

  beginLogin(input: {
    installationId: string
    installationKind: InstallationKind
    publicKey: JsonWebKey
  }): Promise<LoginAttemptView> {
    return this.json('/v1/account/login-attempts', { method: 'POST', body: JSON.stringify(input) })
  }

  pollLogin(input: { attemptId: string; pollingToken: string; proof: AccountProof }): Promise<LoginPollResult> {
    return this.json('/v1/account/login-poll', { method: 'POST', body: JSON.stringify(input) })
  }

  refresh(input: { refreshToken: string; proof: AccountProof }): Promise<AccountSessionView> {
    return this.json('/v1/account/session/refresh', { method: 'POST', body: JSON.stringify(input) })
  }

  current(input: { accessToken: string; proof: AccountProof }): Promise<PlatformAccountView> {
    return this.json('/v1/account/session', {
      method: 'GET',
      headers: proofHeaders(input.accessToken, input.proof),
    })
  }

  async signOut(input: { accessToken: string; proof: AccountProof }): Promise<void> {
    await this.request('/v1/account/session', {
      method: 'DELETE',
      headers: proofHeaders(input.accessToken, input.proof),
    })
  }

  private async json<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.request(path, init)
    return await response.json() as T
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers)
    if (init.body !== undefined) headers.set('content-type', 'application/json')
    const response = await this.fetch(`${this.origin}${path}`, { ...init, headers })
    if (response.ok) return response
    let message = `Platform Account request failed with HTTP ${response.status}`
    try {
      const body = await response.json() as unknown
      if (isErrorBody(body)) message = `${body.error.code}: ${body.error.message}`
    } catch {
      // A non-JSON proxy failure has no stable Platform error body.
    }
    throw new Error(message)
  }
}

interface PendingLogin {
  attempt: LoginAttemptView
  privateKey: CryptoKey
}

/** Local current-installation session, including its non-exported signing key. */
export interface StoredInstallationSession {
  environment: PlatformEnvironment
  session: AccountSessionView
  privateKey: CryptoKey
}

/** Persistence used for session recovery and account-scoped product material. */
export interface InstallationAccountStore {
  loadSession(environment: PlatformEnvironment): Promise<StoredInstallationSession | undefined>
  saveSession(record: StoredInstallationSession): Promise<void>
  clearSession(environment: PlatformEnvironment): Promise<void>
  savePending(environment: PlatformEnvironment, pending: PendingLogin): Promise<void>
  loadPending(environment: PlatformEnvironment): Promise<PendingLogin | undefined>
  clearPending(environment: PlatformEnvironment): Promise<void>
}

/** In-memory installation store for keyless compositions and tests. */
export class MemoryInstallationAccountStore implements InstallationAccountStore {
  private readonly sessions = new Map<PlatformEnvironment, StoredInstallationSession>()
  private readonly pending = new Map<PlatformEnvironment, PendingLogin>()
  private readonly material = new Map<string, Map<string, unknown>>()

  loadSession(environment: PlatformEnvironment): Promise<StoredInstallationSession | undefined> {
    return Promise.resolve(this.sessions.get(environment))
  }

  saveSession(record: StoredInstallationSession): Promise<void> {
    this.sessions.set(record.environment, record)
    return Promise.resolve()
  }

  clearSession(environment: PlatformEnvironment): Promise<void> {
    this.sessions.delete(environment)
    return Promise.resolve()
  }

  savePending(environment: PlatformEnvironment, pending: PendingLogin): Promise<void> {
    this.pending.set(environment, pending)
    return Promise.resolve()
  }

  loadPending(environment: PlatformEnvironment): Promise<PendingLogin | undefined> {
    return Promise.resolve(this.pending.get(environment))
  }

  clearPending(environment: PlatformEnvironment): Promise<void> {
    this.pending.delete(environment)
    return Promise.resolve()
  }

  /**
   * Store test and adapter material under one account-specific namespace.
   * @param accountId - Platform Account owning the material.
   * @param key - adapter-owned material name.
   * @param value - adapter-owned material value.
   */
  setAccountMaterial(accountId: string, key: string, value: unknown): void {
    let scope = this.material.get(accountId)
    if (scope === undefined) {
      scope = new Map()
      this.material.set(accountId, scope)
    }
    scope.set(key, value)
  }

  /**
   * Read test and adapter material from one account-specific namespace.
   * @param accountId - Platform Account owning the material.
   * @param key - adapter-owned material name.
   * @returns stored value, or `undefined` when absent.
   */
  getAccountMaterial(accountId: string, key: string): unknown {
    return this.material.get(accountId)?.get(key)
  }
}

/** IndexedDB installation store for stable Mobile webview origins. */
export class IndexedDbInstallationAccountStore implements InstallationAccountStore {
  private readonly database: Promise<IDBDatabase>

  /** @param databaseName - application-owned database name; defaults to the Gestalt account store. */
  constructor(databaseName = 'deepseek-gestalt-platform-account') {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore('records') }
      request.onsuccess = () => { resolve(request.result) }
      request.onerror = () => { reject(request.error ?? new Error('Platform Account IndexedDB open failed')) }
    })
  }

  loadSession(environment: PlatformEnvironment): Promise<StoredInstallationSession | undefined> {
    return this.read(`${environment}:session`)
  }

  saveSession(record: StoredInstallationSession): Promise<void> {
    return this.write(`${record.environment}:session`, record)
  }

  clearSession(environment: PlatformEnvironment): Promise<void> {
    return this.remove(`${environment}:session`)
  }

  savePending(environment: PlatformEnvironment, pending: PendingLogin): Promise<void> {
    return this.write(`${environment}:pending`, pending)
  }

  loadPending(environment: PlatformEnvironment): Promise<PendingLogin | undefined> {
    return this.read(`${environment}:pending`)
  }

  clearPending(environment: PlatformEnvironment): Promise<void> {
    return this.remove(`${environment}:pending`)
  }

  private async read<T>(key: string): Promise<T | undefined> {
    const database = await this.database
    return new Promise((resolve, reject) => {
      const request = database.transaction('records', 'readonly').objectStore('records').get(key)
      request.onsuccess = () => { resolve(request.result as T | undefined) }
      request.onerror = () => { reject(request.error ?? new Error('Platform Account IndexedDB read failed')) }
    })
  }

  private async write(key: string, value: unknown): Promise<void> {
    const database = await this.database
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('records', 'readwrite')
      transaction.objectStore('records').put(value, key)
      transaction.oncomplete = () => { resolve() }
      transaction.onerror = () => { reject(transaction.error ?? new Error('Platform Account IndexedDB write failed')) }
    })
  }

  private async remove(key: string): Promise<void> {
    const database = await this.database
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('records', 'readwrite')
      transaction.objectStore('records').delete(key)
      transaction.oncomplete = () => { resolve() }
      transaction.onerror = () => { reject(transaction.error ?? new Error('Platform Account IndexedDB delete failed')) }
    })
  }
}

/**
 * Build the stable local prefix for pairing keys, caches, and operation receipts.
 * @param environment - deployment environment owning the material.
 * @param accountId - Platform Account owning the material.
 * @returns account-specific storage namespace.
 */
export function accountStorageNamespace(environment: PlatformEnvironment, accountId: PlatformAccountId): string {
  return `platform-account:${environment}:${accountId}`
}

/** Observable installation state consumed by Desktop and Mobile presentation. */
export interface PlatformAccountInstallationSnapshot {
  status: 'idle' | 'authorizing' | 'polling' | 'signed-in' | 'signing-out' | 'failed'
  privacyAccepted: boolean
  account?: PlatformAccountView
  error?: string
}

/** Controller construction inputs. */
export interface PlatformAccountInstallationOptions {
  environment: PlatformEnvironment
  installationId: string
  installationKind: InstallationKind
  transport: PlatformAccountTransport
  store: InstallationAccountStore
  openSystemBrowser: (url: string) => void | Promise<void>
  crypto?: Crypto
  now?: () => number
}

/**
 * One Desktop or Mobile installation's Account lifecycle. OAuth callbacks
 * return only to Platform; the installation completes through signed polling.
 */
export class PlatformAccountInstallation {
  private snapshot: PlatformAccountInstallationSnapshot = { status: 'idle', privacyAccepted: false }
  private readonly listeners = new Set<() => void>()
  private readonly crypto: Crypto
  private readonly now: () => number

  /** @param options - environment, installation identity, adapters, and browser opener. */
  constructor(private readonly options: PlatformAccountInstallationOptions) {
    this.crypto = options.crypto ?? globalThis.crypto
    this.now = options.now ?? Date.now
  }

  /** Read the current observable installation lifecycle state.
   * @returns the stable current snapshot until the next lifecycle transition.
   */
  getSnapshot(): PlatformAccountInstallationSnapshot {
    return this.snapshot
  }

  /**
   * Observe snapshot replacements.
   * @param listener - callback invoked after the snapshot reference changes.
   * @returns disposer that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Record acceptance of the bilingual notice for this presentation run. */
  acceptPrivacy(): void {
    this.publish({ ...withoutError(this.snapshot), privacyAccepted: true })
  }

  /** Restore a current installation session from protected local storage. */
  async load(): Promise<void> {
    const stored = await this.options.store.loadSession(this.options.environment)
    if (stored === undefined) return
    if (stored.session.refreshExpiresAt <= this.now()) {
      await this.options.store.clearSession(this.options.environment)
      return
    }
    try {
      let session = stored.session
      if (session.accessExpiresAt <= this.now()) {
        const proof = await this.proof(
          stored.privateKey,
          'refresh',
          await hashToken(this.crypto, session.refreshToken),
        )
        session = await this.options.transport.refresh({ refreshToken: session.refreshToken, proof })
      } else {
        const proof = await this.proof(
          stored.privateKey,
          'current',
          await hashToken(this.crypto, session.accessToken),
        )
        const account = await this.options.transport.current({ accessToken: session.accessToken, proof })
        session = { ...session, account }
      }
      await this.options.store.saveSession({ ...stored, session })
      this.publish({ status: 'signed-in', privacyAccepted: this.snapshot.privacyAccepted, account: session.account })
    } catch (error) {
      if (isTerminalSessionError(error)) {
        await this.options.store.clearSession(this.options.environment)
        this.publish({ status: 'idle', privacyAccepted: this.snapshot.privacyAccepted })
        return
      }
      this.fail(error)
    }
  }

  /** Generate a fresh P-256 installation key and open GitHub in the system browser. */
  async beginLogin(): Promise<void> {
    if (!this.snapshot.privacyAccepted) throw new Error('privacy notice must be accepted before authorization')
    this.publish({ status: 'authorizing', privacyAccepted: true })
    try {
      const pair = await this.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify'],
      )
      const publicKey = await this.crypto.subtle.exportKey('jwk', pair.publicKey)
      const attempt = await this.options.transport.beginLogin({
        installationId: this.options.installationId,
        installationKind: this.options.installationKind,
        publicKey,
      })
      await this.options.store.savePending(this.options.environment, { attempt, privateKey: pair.privateKey })
      await this.options.openSystemBrowser(attempt.authorizationUrl)
      this.publish({ status: 'polling', privacyAccepted: true })
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  /**
   * Poll the active five-minute attempt once.
   * @returns pending state or the newly issued current-installation session.
   */
  async pollLogin(): Promise<LoginPollResult> {
    const pending = await this.options.store.loadPending(this.options.environment)
    if (pending === undefined) throw new Error('no login attempt is pending')
    const proof = await this.proof(
      pending.privateKey,
      'login-poll',
      `${pending.attempt.id}:${await hashToken(this.crypto, pending.attempt.pollingToken)}`,
    )
    try {
      const result = await this.options.transport.pollLogin({
        attemptId: pending.attempt.id,
        pollingToken: pending.attempt.pollingToken,
        proof,
      })
      if (result.status === 'pending') return result
      await this.options.store.saveSession({
        environment: this.options.environment,
        session: result,
        privateKey: pending.privateKey,
      })
      await this.options.store.clearPending(this.options.environment)
      this.publish({ status: 'signed-in', privacyAccepted: true, account: result.account })
      return result
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  /** Revoke this installation session and retain every account-scoped material namespace. */
  async signOut(): Promise<void> {
    const stored = await this.options.store.loadSession(this.options.environment)
    if (stored === undefined) return
    this.publish({ ...withoutError(this.snapshot), status: 'signing-out' })
    try {
      const proof = await this.proof(
        stored.privateKey,
        'sign-out',
        await hashToken(this.crypto, stored.session.accessToken),
      )
      await this.options.transport.signOut({ accessToken: stored.session.accessToken, proof })
      await this.options.store.clearSession(this.options.environment)
      this.publish({ status: 'idle', privacyAccepted: this.snapshot.privacyAccepted })
    } catch (error) {
      if (isTerminalSessionError(error)) {
        await this.options.store.clearSession(this.options.environment)
        this.publish({ status: 'idle', privacyAccepted: this.snapshot.privacyAccepted })
        return
      }
      this.fail(error)
      throw error
    }
  }

  private async proof(privateKey: CryptoKey, operation: string, binding: string): Promise<AccountProof> {
    const issuedAt = this.now()
    const jti = this.crypto.randomUUID()
    const payload = new TextEncoder().encode(`${operation}\n${binding}\n${issuedAt}\n${jti}`)
    const signature = await this.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, payload)
    return { jti, issuedAt, signature: base64url(new Uint8Array(signature)) }
  }

  private fail(error: unknown): void {
    this.publish({
      ...this.snapshot,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  private publish(snapshot: PlatformAccountInstallationSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

async function hashToken(crypto: Crypto, token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return base64url(new Uint8Array(digest))
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function proofHeaders(accessToken: string, proof: AccountProof): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Gestalt-Proof-Jti': proof.jti,
    'X-Gestalt-Proof-Issued-At': String(proof.issuedAt),
    'X-Gestalt-Proof-Signature': proof.signature,
  }
}

function isErrorBody(value: unknown): value is { error: { code: string; message: string } } {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const error = value.error
  return typeof error === 'object' && error !== null
    && 'code' in error && typeof error.code === 'string'
    && 'message' in error && typeof error.message === 'string'
}

function withoutError(snapshot: PlatformAccountInstallationSnapshot): PlatformAccountInstallationSnapshot {
  if (snapshot.error === undefined) return snapshot
  const clean: PlatformAccountInstallationSnapshot = {
    status: snapshot.status,
    privacyAccepted: snapshot.privacyAccepted,
    ...(snapshot.account === undefined ? {} : { account: snapshot.account }),
  }
  return clean
}

function isTerminalSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.startsWith('SESSION_REVOKED:') || error.message.startsWith('SESSION_EXPIRED:')
}
