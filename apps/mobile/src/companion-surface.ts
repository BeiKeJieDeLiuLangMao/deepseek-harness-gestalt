/** Product-owned Mobile projection of authenticated Desktop Companion state. */

import type {
  CompanionHostFailure,
  CompanionOperationId,
  CompanionResult,
  CompanionSessionSearchItem,
} from '@deepseek-ai/dsh-remote-protocol'
import type { CompanionInteraction } from './companion-approval.ts'
import type { CompanionSessionSummary } from './companion-history.ts'
import { companionMayMutate, type CompanionForegroundRuntime } from './companion-lifecycle.ts'
import { requireCompanionMutation, type CompanionMutationName } from './companion-mutation.ts'

interface ValidatedDesktopSurfaceResync {
  readonly type: 'desktop-resync'
  readonly version: 1
  readonly authenticated: true
  readonly sessions: readonly CompanionSessionSummary[]
  readonly streaming: boolean
}

interface ValidatedDesktopSurfaceResyncReceiver {
  /** @param message - decoded projection authenticated for the receiver's physical connection. */
  acceptValidatedDesktopResync(message: ValidatedDesktopSurfaceResync): void
}

/** Current Desktop-confirmed content retained while a replacement connection resynchronizes. */
interface MobileCompanionSurfaceSnapshot {
  /** Last authenticated Session projection. */
  readonly sessions: readonly CompanionSessionSummary[]
  /** Last authenticated execution state. */
  readonly streaming: boolean
  /** Current Desktop-authoritative full-text search state. */
  readonly search: MobileCompanionSearchSnapshot
}

/** Desktop-authoritative search state; Mobile never synthesizes substring hits. */
export type MobileCompanionSearchSnapshot =
  | { readonly query: ''; readonly status: 'idle'; readonly items: readonly []; readonly hasMore: false }
  | {
    readonly query: string
    readonly status: 'loading' | 'ready'
    readonly items: readonly CompanionSessionSearchItem[]
    readonly hasMore: boolean
  }
  | {
    readonly query: string
    readonly status: 'error'
    readonly items: readonly CompanionSessionSearchItem[]
    readonly hasMore: boolean
    readonly error: CompanionHostFailure
  }

/** Optional encrypted mutation channel installed with the authenticated Companion decoder. */
export interface MobileCompanionMutationChannel {
  /** @param input - Desktop-default Session target. */
  create(input: { workspace?: string }): void
  /** @param sessionId - Desktop Session target. @param text - prompt text. */
  submit(sessionId: string, text: string): void
  /** @param sessionId - Desktop Session target. */
  cancel(sessionId: string): void
  /** @param sessionId - Desktop Session target. */
  attach(sessionId: string, file: File): void
  /** @param query - non-blank authoritative Session search. @returns operation id used to correlate its result. */
  search(query: string): CompanionOperationId
  /** @param interaction - Desktop-authorized approval or question settlement. */
  settle(interaction: CompanionInteraction): void
}

/** Generation-bound Desktop projection plus fail-closed Mobile mutation callbacks. */
export class MobileCompanionSurface {
  readonly #runtime: CompanionForegroundRuntime
  readonly #mutations: MobileCompanionMutationChannel | undefined
  readonly #listeners = new Set<() => void>()
  #snapshot: MobileCompanionSurfaceSnapshot = {
    sessions: [],
    streaming: false,
    search: { query: '', status: 'idle', items: [], hasMore: false },
  }
  #searchOperationId: CompanionOperationId | undefined

  /**
   * @param runtime - current physical-connection synchronization authority.
   * @param mutations - encrypted mutation channel; omitted until its decoder owns this surface.
   */
  constructor(runtime: CompanionForegroundRuntime, mutations?: MobileCompanionMutationChannel) {
    this.#runtime = runtime
    this.#mutations = mutations
  }

  /** @returns the last authenticated Desktop projection. */
  getSnapshot(): MobileCompanionSurfaceSnapshot {
    return this.#snapshot
  }

  /**
   * Subscribe to authenticated Desktop projection changes.
   * @param listener - observer invoked after an accepted projection.
   * @returns disposer.
   */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /**
   * Bind projection acceptance to the current physical connection generation.
   * Raw Relay ciphertext cannot call this receiver.
   * @returns receiver for an authenticated decoder, or `undefined` while disconnected.
   */
  bindValidatedDesktopResync(): ValidatedDesktopSurfaceResyncReceiver | undefined {
    const lifecycleReceiver = this.#runtime.bindValidatedDesktopResync()
    if (lifecycleReceiver === undefined) return undefined
    return {
      acceptValidatedDesktopResync: (message) => {
        const accepted = lifecycleReceiver.acceptValidatedDesktopResync(message)
        if (!accepted) return
        this.#snapshot = {
          sessions: message.sessions.map(session => ({
            ...session,
            ...(session.transcript === undefined ? {} : { transcript: [...session.transcript] }),
            ...(session.blocks === undefined ? {} : { blocks: [...session.blocks] }),
          })),
          streaming: message.streaming,
          search: this.#snapshot.search,
        }
        this.publish()
      },
    }
  }

  /** @param input - Desktop-default Session target. */
  readonly create = (input: { workspace?: string }): void => {
    this.transmit('session-create', (channel) => { channel.create(input) })
  }

  /** @param sessionId - Desktop Session target. @param text - prompt text. */
  readonly submit = (sessionId: string, text: string): void => {
    this.transmit('prompt', (channel) => { channel.submit(sessionId, text) })
  }

  /** @param sessionId - Desktop Session target. */
  readonly cancel = (sessionId: string): void => {
    this.transmit('cancel', (channel) => { channel.cancel(sessionId) })
  }

  /** @param sessionId - Desktop Session target. @param file - real browser-selected file. */
  readonly attach = (sessionId: string, file: File): void => {
    this.transmit('attachment', (channel) => { channel.attach(sessionId, file) })
  }

  /**
   * Request Desktop full-text Session search without inspecting the local Companion Cache.
   * @param query - user query; blank input clears the search page locally without fabricating hits.
   */
  readonly search = (query: string): void => {
    const trimmed = query.trim()
    if (trimmed === '') {
      this.#searchOperationId = undefined
      this.#snapshot = {
        ...this.#snapshot,
        search: { query: '', status: 'idle', items: [], hasMore: false },
      }
      this.publish()
      return
    }
    if (!companionMayMutate(this.#runtime.getState())) {
      throw new Error('Companion search requires foreground synchronization')
    }
    if (this.#mutations === undefined) throw new Error('Companion encrypted mutation channel is unavailable')
    this.#searchOperationId = this.#mutations.search(trimmed)
    this.#snapshot = {
      ...this.#snapshot,
      search: { query: trimmed, status: 'loading', items: [], hasMore: false },
    }
    this.publish()
  }

  /**
   * Apply one decoded result authenticated by the current Encrypted Companion channel.
   * @param result - validated result after endpoint decryption and protocol decoding.
   */
  acceptValidatedCompanionResult(result: CompanionResult): void {
    if (result.operationId !== this.#searchOperationId) return
    if (result.type === 'session-search') {
      this.#snapshot = {
        ...this.#snapshot,
        search: {
          query: this.#snapshot.search.query,
          status: 'ready',
          items: result.items.map(item => ({ ...item })),
          hasMore: result.hasMore,
        },
      }
      this.publish()
      return
    }
    if (result.type === 'operation-failed') {
      this.#snapshot = {
        ...this.#snapshot,
        search: {
          query: this.#snapshot.search.query,
          status: 'error',
          items: this.#snapshot.search.items,
          hasMore: this.#snapshot.search.hasMore,
          error: result.failure,
        },
      }
      this.publish()
    }
  }

  /** @param interaction - Desktop-authorized approval or question settlement. */
  readonly settle = (interaction: CompanionInteraction): void => {
    this.transmit(interaction.kind === 'approval' ? 'approval' : 'question', (channel) => { channel.settle(interaction) })
  }

  private transmit(kind: CompanionMutationName, send: (channel: MobileCompanionMutationChannel) => void): void {
    requireCompanionMutation(this.#runtime.getState(), kind)
    if (this.#mutations === undefined) {
      throw new Error('Companion encrypted mutation channel is unavailable')
    }
    send(this.#mutations)
  }

  private publish(): void {
    const errors: unknown[] = []
    for (const listener of [...this.#listeners]) {
      try { listener() } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) {
      console.error('[companion-surface] subscriber failures:', new AggregateError(errors))
    }
  }
}
