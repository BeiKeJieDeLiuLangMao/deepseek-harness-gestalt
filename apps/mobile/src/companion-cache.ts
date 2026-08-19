/** Per-Paired-Desktop Companion Cache and uncertain-operation recovery. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { CompanionConfirmedResult, CompanionOperationId } from '@deepseek-ai/dsh-remote-protocol'

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

/** Content kinds the Companion Cache may automatically seal. */
export type CompanionCacheContentKind = 'workspace-metadata' | 'session-metadata' | 'transcript'

/** Content kinds that must never be automatically cached. */
export const COMPANION_CACHE_EXCLUDED_KINDS = [
  'attachment-bytes',
  'terminal-content',
  'spill-file',
  'credential',
] as const

/** Content kind outside the automatic-cache allowlist. */
export type CompanionCacheExcludedKind = (typeof COMPANION_CACHE_EXCLUDED_KINDS)[number]

const ADMITTED_CONTENT_KINDS: readonly CompanionCacheContentKind[] = [
  'workspace-metadata',
  'session-metadata',
  'transcript',
]

/**
 * Decide whether one content kind may enter the automatic Companion Cache.
 * Unknown kinds stay out: only the explicit allowlist is admitted.
 * @param kind - content kind proposed for caching.
 * @returns whether the kind may be sealed automatically.
 */
export function companionCacheAdmits(kind: string): kind is CompanionCacheContentKind {
  return (ADMITTED_CONTENT_KINDS as readonly string[]).includes(kind)
}

/** Mutations Remote Offline disables; cache reads stay permitted. */
export const COMPANION_OFFLINE_MUTATIONS = [
  'prompt',
  'cancel',
  'approval',
  'question',
  'attachment',
  'other-mutation',
] as const

export type CompanionMutationKind = (typeof COMPANION_OFFLINE_MUTATIONS)[number]

/**
 * Whether a mutation may run in the current connection state.
 * @param online - Remote Online.
 * @param _kind - mutation kind reserved for future per-kind policy.
 * @returns false for every mutation while Remote Offline.
 */
export function companionMutationAllowed(online: boolean, _kind: CompanionMutationKind): boolean {
  return online
}

/** Encrypted-at-rest cache row for one Paired Desktop. */
export interface CompanionCacheRecord {
  desktopId: CompanionDesktopId
  iv: Uint8Array<ArrayBuffer>
  ciphertext: Uint8Array<ArrayBuffer>
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

/** Authenticated cipher sealing opened content per Paired Desktop. */
export interface CompanionCacheCipher {
  /**
   * Encrypt one cache row.
   * @param desktopId - Paired Desktop identity owning the key.
   * @param plaintext - opened metadata or transcript bytes.
   * @returns sealed row with a fresh per-record IV.
   */
  seal(desktopId: CompanionDesktopId, plaintext: Uint8Array): Promise<CompanionCacheRecord>
  /**
   * Decrypt one cache row.
   * @param record - sealed row.
   * @returns opened metadata or transcript bytes.
   */
  open(record: CompanionCacheRecord): Promise<Uint8Array>
}

/** WebCrypto AES-GCM cipher over per-desktop keys from the pairing seam. */
export class WebCryptoCompanionCacheCipher implements CompanionCacheCipher {
  readonly #keys: CompanionCacheKeySource

  /** @param keys - Personal Pairing seam supplying per-desktop cache keys. */
  constructor(keys: CompanionCacheKeySource) {
    this.#keys = keys
  }

  async seal(desktopId: CompanionDesktopId, plaintext: Uint8Array): Promise<CompanionCacheRecord> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const bytes = new Uint8Array(plaintext)
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await this.#keys.keyFor(desktopId),
      bytes,
    ))
    return { desktopId, iv, ciphertext }
  }

  async open(record: CompanionCacheRecord): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv },
      await this.#keys.keyFor(record.desktopId),
      record.ciphertext,
    ))
  }
}

/** Settlement state of one transmitted operation. */
export type CompanionReceiptStatus = 'unknown' | 'committed' | 'not-submitted'

/** Operation Receipt row stored only after transmission. */
export interface CompanionOperationReceipt {
  operationId: CompanionOperationId
  status: CompanionReceiptStatus
  /** Desktop's original result once reconciliation returned committed. */
  original?: CompanionConfirmedResult
}

/**
 * Durable cache and receipt rows, separate from pairing-key storage. Content
 * rows are keyed by Paired Desktop and content kind, so metadata and a
 * transcript of one Desktop coexist.
 */
export interface CompanionCacheStore {
  /**
   * @param desktopId - Paired Desktop whose row is written.
   * @param kind - admitted content kind of the row.
   * @param record - sealed row.
   */
  saveContent(desktopId: CompanionDesktopId, kind: CompanionCacheContentKind, record: CompanionCacheRecord): Promise<void>
  /**
   * @param desktopId - Paired Desktop whose row is read.
   * @param kind - admitted content kind of the row.
   * @returns sealed row, or `undefined` when nothing is cached.
   */
  loadContent(
    desktopId: CompanionDesktopId,
    kind: CompanionCacheContentKind,
  ): Promise<CompanionCacheRecord | undefined>
  /**
   * Drop one Paired Desktop's cached rows; pairing-key records stay untouched.
   * @param desktopId - Paired Desktop to clear.
   */
  clearDesktop(desktopId: CompanionDesktopId): Promise<void>
  /**
   * @param desktopId - owning Paired Desktop.
   * @param receipt - receipt row.
   */
  saveReceipt(desktopId: CompanionDesktopId, receipt: CompanionOperationReceipt): Promise<void>
  /**
   * @param desktopId - owning Paired Desktop.
   * @returns every stored receipt row.
   */
  loadReceipts(desktopId: CompanionDesktopId): Promise<readonly CompanionOperationReceipt[]>
}

function contentKey(desktopId: CompanionDesktopId, kind: CompanionCacheContentKind): string {
  return `${desktopId}::${kind}`
}

function desktopPrefix(desktopId: CompanionDesktopId): string {
  return `${desktopId}::`
}

/** In-memory store for tests and keyless example compositions. */
export class InMemoryCompanionCacheStore implements CompanionCacheStore {
  readonly #content = new Map<string, CompanionCacheRecord>()
  readonly #receipts = new Map<string, CompanionOperationReceipt>()

  async saveContent(
    desktopId: CompanionDesktopId,
    kind: CompanionCacheContentKind,
    record: CompanionCacheRecord,
  ): Promise<void> {
    this.#content.set(contentKey(desktopId, kind), record)
  }

  async loadContent(
    desktopId: CompanionDesktopId,
    kind: CompanionCacheContentKind,
  ): Promise<CompanionCacheRecord | undefined> {
    return this.#content.get(contentKey(desktopId, kind))
  }

  async clearDesktop(desktopId: CompanionDesktopId): Promise<void> {
    const prefix = desktopPrefix(desktopId)
    for (const key of [...this.#content.keys(), ...this.#receipts.keys()]) {
      if (!key.startsWith(prefix)) continue
      this.#content.delete(key)
      this.#receipts.delete(key)
    }
  }

  async saveReceipt(desktopId: CompanionDesktopId, receipt: CompanionOperationReceipt): Promise<void> {
    this.#receipts.set(`${desktopPrefix(desktopId)}${receipt.operationId}`, receipt)
  }

  async loadReceipts(desktopId: CompanionDesktopId): Promise<readonly CompanionOperationReceipt[]> {
    const prefix = desktopPrefix(desktopId)
    return [...this.#receipts.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, row]) => row)
  }
}

/** IndexedDB cache store for stable Mobile webview origins. */
export class IndexedDbCompanionCacheStore implements CompanionCacheStore {
  readonly #database: Promise<IDBDatabase>

  /** @param databaseName - application-owned database; defaults to the Gestalt companion cache. */
  constructor(databaseName = 'deepseek-gestalt-companion-cache') {
    this.#database = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('content')
        request.result.createObjectStore('receipts')
      }
      request.onsuccess = () => { resolve(request.result) }
      request.onerror = () => { reject(request.error ?? new Error('Companion cache IndexedDB open failed')) }
    })
  }

  async saveContent(
    desktopId: CompanionDesktopId,
    kind: CompanionCacheContentKind,
    record: CompanionCacheRecord,
  ): Promise<void> {
    await this.write('content', contentKey(desktopId, kind), record)
  }

  async loadContent(
    desktopId: CompanionDesktopId,
    kind: CompanionCacheContentKind,
  ): Promise<CompanionCacheRecord | undefined> {
    return await this.read<CompanionCacheRecord>('content', contentKey(desktopId, kind))
  }

  async clearDesktop(desktopId: CompanionDesktopId): Promise<void> {
    const database = await this.#database
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['content', 'receipts'], 'readwrite')
      const range = desktopRange(desktopId)
      transaction.objectStore('content').delete(range)
      transaction.objectStore('receipts').delete(range)
      transaction.oncomplete = () => { resolve() }
      transaction.onerror = () => { reject(transaction.error ?? new Error('Companion cache IndexedDB delete failed')) }
    })
  }

  async saveReceipt(desktopId: CompanionDesktopId, receipt: CompanionOperationReceipt): Promise<void> {
    const database = await this.#database
    await new Promise<void>((resolve, reject) => {
      const key = `${desktopPrefix(desktopId)}${receipt.operationId}`
      // One readwrite transaction covers read-modify-write, so concurrent
      // senders cannot interleave between the read and the put.
      const transaction = database.transaction('receipts', 'readwrite')
      const store = transaction.objectStore('receipts')
      const existing = store.get(key)
      existing.onsuccess = () => { store.put({ ...(existing.result as CompanionOperationReceipt | undefined), ...receipt }, key) }
      transaction.oncomplete = () => { resolve() }
      transaction.onerror = () => { reject(transaction.error ?? new Error('Companion cache IndexedDB write failed')) }
    })
  }

  async loadReceipts(desktopId: CompanionDesktopId): Promise<readonly CompanionOperationReceipt[]> {
    const database = await this.#database
    return new Promise((resolve, reject) => {
      const request = database.transaction('receipts', 'readonly').objectStore('receipts').getAll(desktopRange(desktopId))
      request.onsuccess = () => { resolve(request.result as CompanionOperationReceipt[]) }
      request.onerror = () => { reject(request.error ?? new Error('Companion cache IndexedDB read failed')) }
    })
  }

  private async read<T>(store: 'content' | 'receipts', key: string): Promise<T | undefined> {
    const database = await this.#database
    return new Promise((resolve, reject) => {
      const request = database.transaction(store, 'readonly').objectStore(store).get(key)
      request.onsuccess = () => { resolve(request.result as T | undefined) }
      request.onerror = () => { reject(request.error ?? new Error('Companion cache IndexedDB read failed')) }
    })
  }

  private async write(store: 'content' | 'receipts', key: string, value: unknown): Promise<void> {
    const database = await this.#database
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, 'readwrite')
      transaction.objectStore(store).put(value, key)
      transaction.oncomplete = () => { resolve() }
      transaction.onerror = () => { reject(transaction.error ?? new Error('Companion cache IndexedDB write failed')) }
    })
  }
}

function desktopRange(desktopId: CompanionDesktopId): IDBKeyRange {
  const prefix = desktopPrefix(desktopId)
  return IDBKeyRange.bound(prefix, `${prefix}\u{10ffff}`, false, false)
}

/** Sealed Companion Cache for one installation; cache rows stay read-only authority. */
export class CompanionCache {
  readonly #store: CompanionCacheStore
  readonly #cipher: CompanionCacheCipher

  /** @param store - durable rows. @param cipher - per-desktop authenticated cipher. */
  constructor(store: CompanionCacheStore, cipher: CompanionCacheCipher) {
    this.#store = store
    this.#cipher = cipher
  }

  /**
   * Seal opened Workspace/Session metadata or a transcript for offline reads.
   * @param desktopId - Paired Desktop that confirmed the content.
   * @param kind - admitted content kind; excluded kinds fail loud.
   * @param plaintext - Desktop-confirmed content.
   */
  async saveOpenedContent(
    desktopId: CompanionDesktopId,
    kind: CompanionCacheContentKind | CompanionCacheExcludedKind | string,
    plaintext: string,
  ): Promise<void> {
    if (!companionCacheAdmits(kind)) {
      throw new TypeError(`Companion Cache never automatically stores ${String(kind)}`)
    }
    await this.#store.saveContent(desktopId, kind, await this.#cipher.seal(
      desktopId,
      new TextEncoder().encode(plaintext),
    ))
  }

  /**
   * Read cached plaintext; Remote Offline permits this read.
   * @param desktopId - Paired Desktop whose cache is read.
   * @param kind - admitted content kind of the row.
   * @returns Desktop-confirmed content, or `undefined` when nothing is cached.
   */
  async loadOpenedContent(
    desktopId: CompanionDesktopId,
    kind: CompanionCacheContentKind,
  ): Promise<string | undefined> {
    const record = await this.#store.loadContent(desktopId, kind)
    if (record === undefined) return undefined
    return new TextDecoder().decode(await this.#cipher.open(record))
  }

  /**
   * Clear one Paired Desktop's cached rows; pairing-key records live in the
   * pairing seam's own store and survive this operation.
   * @param desktopId - Paired Desktop to clear.
   */
  async clearDesktopCache(desktopId: CompanionDesktopId): Promise<void> {
    await this.#store.clearDesktop(desktopId)
  }
}

/** Desktop answer to one operation-status query. */
export type CompanionStatusAnswer =
  | { readonly committed: true; readonly original: CompanionConfirmedResult }
  | { readonly committed: false }

/** One proposed mutation with its Desktop-authoritative operation id. */
export interface CompanionMutationRequest {
  kind: CompanionMutationKind
  operationId: CompanionOperationId
}

/** Transport result once the mutation's fate is known, or explicitly unknown. */
export type CompanionMutationOutcome =
  | { readonly known: true; readonly result: CompanionConfirmedResult }
  | { readonly known: false }

/** Relay-backed transport the settlement controller drives. */
export interface CompanionMutationTransport {
  /**
   * Transmit one mutation; call `onTransmitted` exactly once after the request
   * left this device and before settling.
   * @param mutation - proposed mutation.
   * @param onTransmitted - transmission acknowledgment hook.
   * @returns the Desktop result, or an explicitly unknown outcome.
   */
  send(
    mutation: CompanionMutationRequest,
    onTransmitted: () => void,
  ): Promise<CompanionMutationOutcome>
  /**
   * Query Desktop for the authoritative outcome of one transmitted operation.
   * @param operationId - operation whose receipt is unknown.
   * @returns committed with the original result, or explicitly absent.
   */
  queryStatus(operationId: CompanionOperationId): Promise<CompanionStatusAnswer>
}

/** Single settlement point for uncertain Companion operations. */
export class CompanionUncertainOperationSettlement {
  readonly #store: CompanionCacheStore
  readonly #desktopId: CompanionDesktopId

  /** @param store - durable receipt rows. @param desktopId - owning Paired Desktop. */
  constructor(store: CompanionCacheStore, desktopId: CompanionDesktopId) {
    this.#store = store
    this.#desktopId = desktopId
  }

  /**
   * Transmit one mutation, storing an Operation Receipt only after the request
   * left this device. Offline proposals never reach the transport.
   * @param mutation - proposed mutation.
   * @param transport - Relay-backed transport.
   * @param online - whether Remote is currently Online.
   * @returns the settled receipt, or the unknown receipt awaiting reconciliation.
   */
  async transmit(
    mutation: CompanionMutationRequest,
    transport: CompanionMutationTransport,
    online: boolean,
  ): Promise<CompanionOperationReceipt> {
    if (!companionMutationAllowed(online, mutation.kind)) {
      throw new Error(`Remote Offline disables Companion ${mutation.kind} mutations`)
    }
    let transmissionReceipt: Promise<void> | undefined
    let outcome: CompanionMutationOutcome
    try {
      outcome = await transport.send(mutation, () => {
        transmissionReceipt = this.#store.saveReceipt(
          this.#desktopId,
          { operationId: mutation.operationId, status: 'unknown' },
        )
      })
    } catch (error) {
      // The transmission acknowledgment write must settle before its rejection
      // escapes; otherwise the promise rejects unobserved.
      await transmissionReceipt
      throw error
    }
    await transmissionReceipt
    if (!outcome.known && transmissionReceipt === undefined) {
      throw new Error('Companion transport reported an unknown outcome without acknowledging transmission')
    }
    const receipt: CompanionOperationReceipt = outcome.known
      ? { operationId: mutation.operationId, status: 'committed', original: outcome.result }
      : { operationId: mutation.operationId, status: 'unknown' }
    await this.#store.saveReceipt(this.#desktopId, receipt)
    return receipt
  }

  /**
   * Reconcile every unknown receipt by querying Desktop per operation id.
   * Committed answers keep the original result; explicit absence becomes
   * not-submitted. No operation is re-sent.
   * @param transport - reachable Relay-backed transport.
   * @returns receipts after reconciliation.
   */
  async reconcileUnknown(transport: CompanionMutationTransport): Promise<readonly CompanionOperationReceipt[]> {
    const rows = await this.#store.loadReceipts(this.#desktopId)
    for (const row of rows) {
      if (row.status !== 'unknown') continue
      const answer = await transport.queryStatus(row.operationId)
      await this.#store.saveReceipt(this.#desktopId, answer.committed
        ? { operationId: row.operationId, status: 'committed', original: answer.original }
        : { operationId: row.operationId, status: 'not-submitted' })
    }
    return await this.#store.loadReceipts(this.#desktopId)
  }
}
