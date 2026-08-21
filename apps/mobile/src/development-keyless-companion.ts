/** Mobile client for development Encrypted Companion operations. */

import type { PlatformAccountId, PlatformEnvironment } from '@deepseek-ai/dsh-platform-account'
import {
  isDevelopmentKeylessSyncCiphertext,
  negotiateDevelopmentCompanionProtocol,
  openDevelopmentCompanionMessage,
  sealDevelopmentCompanionMessage,
} from '@deepseek-ai/dsh-remote-access-client'
import type { RelayAttachmentId } from '@deepseek-ai/dsh-remote-protocol'
import {
  parseCompanionInteractionId,
  parseCompanionOperationId,
  parseCompanionSessionId,
  type CompanionMessage,
  type CompanionOperation,
  type CompanionResult,
  type CompanionSessionCatalogRow,
  type CompanionTranscriptEntry,
} from '@deepseek-ai/dsh-remote-protocol'
import { companionRuntime } from './companion-push.ts'
import {
  CompanionCache,
  IndexedDbCompanionCacheStore,
  InMemoryCompanionCacheStore,
  WebCryptoCompanionCacheCipher,
  companionCacheDatabaseName,
  parseCompanionDesktopId,
  type CompanionCacheStore,
  type CompanionDesktopId,
} from './companion-cache.ts'
import {
  createCompanionSession,
  type CompanionSessionSummary,
} from './companion-history.ts'
import type { MobileContentBlock } from './mobile-content.ts'

const OPERATION_TIMEOUT_MS = 15_000
const DEVELOPMENT_CACHE_DESKTOP_ID = parseCompanionDesktopId('desktop-development-keyless')
let installedCache: CompanionCache | undefined

/** Placeholder `src` for Desktop-projected image metadata that carries no Relay bytes. */
export const COMPANION_PROJECTED_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

/** Desktop-authoritative search page owned by the development Companion client. */
export interface CompanionSearchSnapshot {
  /** Last query sent to Desktop. */
  query: string
  /** Host search progress. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Desktop-confirmed hits for the last ready query. */
  hits: readonly CompanionSessionSummary[]
  /** Last Host or transport failure, when present. */
  error?: string
}

const EMPTY_SEARCH: CompanionSearchSnapshot = { query: '', status: 'idle', hits: [] }

/** Desktop-confirmed Session list owned by the development Companion client. */
export class DevelopmentCompanionSessionStore {
  private sessions: readonly CompanionSessionSummary[] = []
  private search: CompanionSearchSnapshot = EMPTY_SEARCH
  private readonly committed = new Set<string>()
  private readonly listeners = new Set<() => void>()

  /**
   * Subscribe to Desktop-confirmed list changes.
   * @param listener - invoked after a confirmed create or transcript projection.
   * @returns disposer.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns current Desktop-confirmed Session rows. */
  getSnapshot(): readonly CompanionSessionSummary[] {
    return this.sessions
  }

  /** @returns current Desktop-authoritative search page. */
  getSearchSnapshot(): CompanionSearchSnapshot {
    return this.search
  }

  /**
   * Replace an empty list with cached Desktop-confirmed rows.
   * @param sessions - opened metadata restored from Companion Cache.
   */
  hydrate(sessions: readonly CompanionSessionSummary[]): void {
    if (this.sessions.length > 0 || sessions.length === 0) return
    this.sessions = sessions
    this.emit()
  }

  /** Drop every Desktop-confirmed row after the operator clears this Desktop cache. */
  reset(): void {
    this.sessions = []
    this.search = EMPTY_SEARCH
    this.emit()
  }

  /**
   * Append a Session only after Desktop confirmed that create.
   * @param input - identifiers and title accepted by Desktop.
   */
  applyCreated(input: { operationId: string; sessionId: string; title: string; workspace?: string }): void {
    const next = createCompanionSession(this.sessions, this.committed, {
      operationId: input.operationId,
      title: input.title,
      ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
      devicePrincipalId: 'current-mobile',
    })
    if (!next.created) return
    this.committed.add(input.operationId)
    this.sessions = next.sessions.map(session => (
      session.id === input.operationId
        ? { ...session, id: input.sessionId, blocks: session.blocks ?? [] }
        : session
    ))
    this.emit()
  }

  /**
   * Replace the list with Desktop-authoritative catalog rows and keep local transcripts.
   * @param rows - Host Session catalog projected by Desktop.
   */
  applyCatalog(rows: readonly CompanionSessionCatalogRow[]): void {
    const previous = new Map(this.sessions.map(session => [session.id, session]))
    this.sessions = rows.map((row) => {
      const existing = previous.get(row.sessionId)
      return {
        id: row.sessionId,
        title: row.title,
        summary: existing?.summary ?? row.summary,
        ...(row.workspace === undefined ? {} : { workspace: row.workspace }),
        ...(row.live === true ? { live: true } : {}),
        ...(existing?.transcript === undefined ? {} : { transcript: existing.transcript }),
        ...(existing?.blocks === undefined ? { blocks: [] } : { blocks: existing.blocks }),
        ...(existing?.snippet === undefined ? {} : { snippet: existing.snippet }),
      }
    })
    this.emit()
  }

  /**
   * Mark a Host search in flight so Mobile can show pending local title matches.
   * @param query - Mobile search text already sent to Desktop.
   */
  beginSearch(query: string): void {
    this.search = { query, status: 'loading', hits: this.search.query === query ? this.search.hits : [] }
    this.emit()
  }

  /**
   * Replace the search page with Desktop-authoritative hits.
   * @param query - query Desktop searched.
   * @param rows - Host search catalog rows.
   */
  applySearch(query: string, rows: readonly CompanionSessionCatalogRow[]): void {
    if (query.trim() === '') {
      this.search = EMPTY_SEARCH
      this.emit()
      return
    }
    const previous = new Map(this.sessions.map(session => [session.id, session]))
    this.search = {
      query,
      status: 'ready',
      hits: rows.map((row) => {
        const existing = previous.get(row.sessionId)
        return {
          id: row.sessionId,
          title: row.title,
          summary: row.summary,
          ...(row.workspace === undefined ? {} : { workspace: row.workspace }),
          ...(row.live === true ? { live: true } : {}),
          ...(existing?.transcript === undefined ? {} : { transcript: existing.transcript }),
          ...(existing?.blocks === undefined ? { blocks: [] } : { blocks: existing.blocks }),
          ...(row.snippet === undefined ? {} : { snippet: row.snippet }),
        }
      }),
    }
    this.emit()
  }

  /**
   * Record a Host or transport failure without inventing Session rows.
   * @param error - stable failure text for the Mobile banner.
   */
  applyError(error: string): void {
    this.search = { ...this.search, status: this.search.query === '' ? 'idle' : 'error', error }
    this.emit()
  }

  /** Clear the last Host or transport failure. */
  clearError(): void {
    if (this.search.error === undefined && this.search.status !== 'error') return
    this.search = {
      query: this.search.query,
      status: this.search.query === '' ? 'idle' : 'ready',
      hits: this.search.hits,
    }
    this.emit()
  }

  /**
   * Replace one Session transcript from a Desktop projection.
   * @param sessionId - Companion Session target.
   * @param entries - Desktop-approved transcript entries.
   * @param streaming - whether Desktop is still producing this page.
   */
  applyTranscript(
    sessionId: string,
    entries: readonly CompanionTranscriptEntry[],
    streaming = false,
  ): void {
    const blocks = entries.map(projectCompanionBlock)
    const transcript = entries.flatMap(entry => (
      entry.type === 'text' ? [entry.text]
        : entry.type === 'image' ? [entry.fileName]
          : [entry.summary]
    ))
    const existing = this.sessions.find(session => session.id === sessionId)
      ?? this.search.hits.find(session => session.id === sessionId)
    const summary = transcript.at(-1) ?? existing?.summary ?? 'New Session'
    const row: CompanionSessionSummary = {
      id: sessionId,
      title: existing?.title ?? 'Session',
      ...(existing?.workspace === undefined ? {} : { workspace: existing.workspace }),
      summary,
      live: streaming,
      transcript,
      blocks,
    }
    this.sessions = existing === undefined
      ? [...this.sessions, row]
      : this.sessions.map(session => session.id === sessionId ? { ...session, ...row, title: session.title } : session)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

function projectCompanionBlock(entry: CompanionTranscriptEntry): MobileContentBlock {
  switch (entry.type) {
    case 'text':
      return { kind: 'markdown', text: entry.text, role: entry.role }
    case 'image':
      return { kind: 'image', alt: entry.alt, src: COMPANION_PROJECTED_IMAGE_SRC }
    case 'approval':
      return {
        kind: 'approval',
        summary: entry.summary,
        interactionId: entry.interactionId,
        authorized: entry.authorized,
        ...(entry.cwd === undefined ? {} : { cwd: entry.cwd }),
        ...(entry.diff === undefined ? {} : { diff: entry.diff }),
        ...(entry.terminal === undefined ? {} : { terminal: entry.terminal }),
        ...(entry.settled === undefined ? {} : { settled: entry.settled }),
      }
    case 'ask-user':
      return {
        kind: 'ask-user',
        question: entry.summary,
        interactionId: entry.interactionId,
        authorized: entry.authorized,
        ...(entry.settled === undefined ? {} : { settled: entry.settled }),
      }
    default: {
      const never: never = entry
      return never
    }
  }
}

/** Send Encrypted Companion operations and apply Desktop results. */
export class DevelopmentCompanionClient {
  private readonly protocol = negotiateDevelopmentCompanionProtocol()
  private readonly pending = new Map<string, {
    resolve: (result: CompanionResult) => void
    reject: (error: Error) => void
  }>()

  constructor(
    private readonly store: DevelopmentCompanionSessionStore,
    private readonly send: (target: RelayAttachmentId, ciphertext: Uint8Array) => Promise<void>,
    private readonly desktopAttachmentId: RelayAttachmentId,
  ) {}

  /** @returns Desktop-confirmed Session store. */
  sessions(): DevelopmentCompanionSessionStore {
    return this.store
  }

  /**
   * Drop this Paired Desktop's Companion Cache and forget the in-memory catalog.
   * Pairing-key records stay in the pairing seam.
   */
  async clearOpenedCache(): Promise<void> {
    if (installedCache !== undefined) {
      await installedCache.clearDesktopCache(DEVELOPMENT_CACHE_DESKTOP_ID)
    }
    this.store.reset()
  }

  /**
   * Open a one-byte sync or a sealed Companion reply.
   * @param ciphertext - inbound Desktop frame, or omitted when a test injects resync.
   */
  async receive(ciphertext?: Uint8Array): Promise<void> {
    if (ciphertext === undefined || isDevelopmentKeylessSyncCiphertext(ciphertext)) {
      companionRuntime()?.synchronize()
      return
    }
    const message = await openDevelopmentCompanionMessage(this.protocol, ciphertext)
    this.dispatch(message)
  }

  /**
   * Send create-session and wait for Desktop confirmation.
   * @param input - Mobile-proposed identifiers and title.
   * @returns Desktop result.
   */
  /**
   * Ask Desktop to project the open Session transcript from Host history.
   * @param sessionId - Companion Session target.
   * @returns Desktop result.
   */
  async openSession(sessionId: string): Promise<CompanionResult> {
    return await this.request({
      type: 'open-session',
      operationId: parseCompanionOperationId(`open-${sessionId}`.replace(/[^A-Za-z0-9_-]/gu, '-').slice(0, 128)),
      sessionId: parseCompanionSessionId(sessionId),
    })
  }

  async createSession(input: {
    operationId: string
    sessionId: string
    title: string
    workspace?: string
  }): Promise<CompanionResult> {
    const result = await this.request({
      type: 'create-session',
      operationId: parseCompanionOperationId(input.operationId),
      sessionId: parseCompanionSessionId(input.sessionId),
      title: input.title,
      ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    })
    if (result.type === 'confirmed') this.store.applyCreated(input)
    return result
  }

  /**
   * Send submit-prompt and wait for Desktop confirmation.
   * @param input - target Session and prompt text.
   * @returns Desktop result.
   */
  async submitPrompt(input: { operationId: string; sessionId: string; text: string }): Promise<CompanionResult> {
    return await this.request({
      type: 'submit-prompt',
      operationId: parseCompanionOperationId(input.operationId),
      sessionId: parseCompanionSessionId(input.sessionId),
      text: input.text,
    })
  }

  /**
   * Ask Desktop to search Host Session titles, workspaces, summaries, and content.
   * @param query - Mobile search text.
   * @returns Desktop result.
   */
  async searchSessions(query: string): Promise<CompanionResult> {
    const trimmed = query.trim()
    if (trimmed === '') {
      this.store.applySearch('', [])
      return {
        type: 'confirmed',
        operationId: parseCompanionOperationId('search-clear'),
        committedAt: Date.now(),
        outcome: 'accepted',
      }
    }
    this.store.beginSearch(trimmed)
    return await this.request({
      type: 'search-sessions',
      operationId: parseCompanionOperationId(`search-${crypto.randomUUID()}`),
      query: trimmed,
    })
  }

  /**
   * Send cancel-prompt and wait for Desktop confirmation.
   * @param input - target Session.
   * @returns Desktop result.
   */
  async cancelPrompt(input: { operationId: string; sessionId: string }): Promise<CompanionResult> {
    return await this.request({
      type: 'cancel-prompt',
      operationId: parseCompanionOperationId(input.operationId),
      sessionId: parseCompanionSessionId(input.sessionId),
    })
  }

  /**
   * Send offer-attachment and wait for Desktop confirmation or rejection.
   * @param operation - bounded control message already built by the attachment helper.
   * @returns Desktop result.
   */
  async offerAttachment(operation: Extract<CompanionOperation, { type: 'offer-attachment' }>): Promise<CompanionResult> {
    return await this.request(operation)
  }

  /**
   * Send settle-approval and wait for Desktop confirmation.
   * @param input - target Session, interaction, and authorized decision.
   * @returns Desktop result.
   */
  async settleApproval(input: {
    operationId: string
    sessionId: string
    interactionId: string
    decision: string
    persistent?: boolean
  }): Promise<CompanionResult> {
    return await this.request({
      type: 'settle-approval',
      operationId: parseCompanionOperationId(input.operationId),
      sessionId: parseCompanionSessionId(input.sessionId),
      interactionId: parseCompanionInteractionId(input.interactionId),
      decision: input.decision,
      ...(input.persistent === undefined ? {} : { persistent: input.persistent }),
    })
  }

  /**
   * Send answer-ask-user and wait for Desktop confirmation.
   * @param input - target Session, interaction, and authorized decision.
   * @returns Desktop result.
   */
  async answerAskUser(input: {
    operationId: string
    sessionId: string
    interactionId: string
    decision: string
  }): Promise<CompanionResult> {
    return await this.request({
      type: 'answer-ask-user',
      operationId: parseCompanionOperationId(input.operationId),
      sessionId: parseCompanionSessionId(input.sessionId),
      interactionId: parseCompanionInteractionId(input.interactionId),
      decision: input.decision,
    })
  }

  private dispatch(message: CompanionMessage): void {
    if (message.type === 'result') {
      this.pending.get(message.result.operationId)?.resolve(message.result)
      return
    }
    if (message.type !== 'projection') return
    if (message.projection.type === 'session-catalog') {
      this.store.applyCatalog(message.projection.sessions)
      return
    }
    if (message.projection.type === 'session-search') {
      this.store.applySearch(message.projection.query, message.projection.sessions)
      return
    }
    this.store.applyTranscript(
      message.projection.sessionId,
      message.projection.entries,
      message.projection.streaming === true,
    )
  }

  private async request(operation: CompanionOperation): Promise<CompanionResult> {
    const operationId = operation.operationId
    const result = new Promise<CompanionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(operationId)
        this.store.applyError('Desktop 未在时限内确认这次操作')
        reject(new Error('Desktop did not confirm the Companion operation'))
      }, OPERATION_TIMEOUT_MS)
      this.pending.set(operationId, {
        resolve: (value) => {
          clearTimeout(timer)
          this.pending.delete(operationId)
          if (value.type === 'rejected') {
            this.store.applyError(value.reason === 'host-unavailable'
              ? 'Desktop Host 未就绪，无法完成这次操作'
              : 'Desktop Host 拒绝了这次操作')
          }
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          this.pending.delete(operationId)
          reject(error)
        },
      })
    })
    try {
      await this.send(
        this.desktopAttachmentId,
        await sealDevelopmentCompanionMessage(this.protocol, { type: 'operation', operation }),
      )
    } catch (error) {
      this.pending.get(operationId)?.reject(error instanceof Error ? error : new Error('Companion send failed'))
    }
    return await result
  }
}

let installed: DevelopmentCompanionClient | undefined

/**
 * Install the process-lifetime development Companion client.
 * @param client - keyless client, or undefined to clear it.
 * @returns disposer.
 */
export function installDevelopmentCompanionClient(
  client?: DevelopmentCompanionClient,
): () => void {
  installed = client
  return () => {
    if (installed === client) installed = undefined
  }
}

/** @returns the installed development Companion client, if any. */
export function developmentCompanionClient(): DevelopmentCompanionClient | undefined {
  return installed
}

/**
 * Build the development Companion Cache for one signed-in Platform Account.
 * @param environment - selected Platform environment.
 * @param accountId - signed-in Platform Account.
 * @param store - durable rows; defaults to the account-scoped IndexedDB database.
 * @returns cache that seals metadata and transcripts only.
 */
export function createDevelopmentCompanionCache(
  environment: PlatformEnvironment,
  accountId: PlatformAccountId,
  store?: CompanionCacheStore,
): CompanionCache {
  return new CompanionCache(
    store ?? new IndexedDbCompanionCacheStore(companionCacheDatabaseName(environment, accountId)),
    new WebCryptoCompanionCacheCipher({
      async keyFor(_desktopId: CompanionDesktopId) {
        return await crypto.subtle.importKey(
          'raw',
          new Uint8Array(32).fill(29),
          'AES-GCM',
          false,
          ['encrypt', 'decrypt'],
        )
      },
    }),
  )
}

/**
 * Restore cached Session rows into an empty store, then persist later Desktop confirmations.
 * @param sessions - live Desktop-confirmed store.
 * @param cache - account-scoped Companion Cache.
 * @returns disposer that stops persisting.
 */
export async function bindDevelopmentCompanionCache(
  sessions: DevelopmentCompanionSessionStore,
  cache: CompanionCache,
): Promise<() => void> {
  installedCache = cache
  const cached = await cache.loadOpenedContent(DEVELOPMENT_CACHE_DESKTOP_ID, 'session-metadata')
  if (cached !== undefined) sessions.hydrate(parseCachedSessions(cached))
  const persist = async (): Promise<void> => {
    const snapshot = sessions.getSnapshot()
    await cache.saveOpenedContent(
      DEVELOPMENT_CACHE_DESKTOP_ID,
      'session-metadata',
      JSON.stringify(snapshot),
    )
    await cache.saveOpenedContent(
      DEVELOPMENT_CACHE_DESKTOP_ID,
      'transcript',
      JSON.stringify(snapshot.map(session => ({
        id: session.id,
        transcript: session.transcript,
        blocks: session.blocks,
      }))),
    )
  }
  await persist()
  const unsubscribe = sessions.subscribe(() => { void persist() })
  return () => {
    unsubscribe()
    if (installedCache === cache) installedCache = undefined
  }
}

/**
 * In-memory development cache used by tests that cannot open IndexedDB.
 * @param environment - selected Platform environment.
 * @param accountId - signed-in Platform Account.
 * @returns cache over an in-memory store.
 */
export function createMemoryDevelopmentCompanionCache(
  environment: PlatformEnvironment,
  accountId: PlatformAccountId,
): CompanionCache {
  return createDevelopmentCompanionCache(environment, accountId, new InMemoryCompanionCacheStore())
}

function parseCachedSessions(plaintext: string): readonly CompanionSessionSummary[] {
  const value = JSON.parse(plaintext) as unknown
  if (!Array.isArray(value)) throw new TypeError('Companion Cache session metadata must be an array')
  return value.map(parseCachedSession)
}

function parseCachedSession(value: unknown): CompanionSessionSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Companion Cache session row must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new TypeError('Companion Cache session id must be a non-empty string')
  }
  if (typeof record.title !== 'string' || record.title.length === 0) {
    throw new TypeError('Companion Cache session title must be a non-empty string')
  }
  if (typeof record.summary !== 'string') {
    throw new TypeError('Companion Cache session summary must be a string')
  }
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    ...(typeof record.workspace === 'string' && record.workspace.length > 0 ? { workspace: record.workspace } : {}),
    ...(record.live === true ? { live: true } : {}),
    ...(Array.isArray(record.transcript) ? { transcript: record.transcript.filter(line => typeof line === 'string') } : {}),
    ...(Array.isArray(record.blocks) ? { blocks: record.blocks as MobileContentBlock[] } : { blocks: [] }),
  }
}
