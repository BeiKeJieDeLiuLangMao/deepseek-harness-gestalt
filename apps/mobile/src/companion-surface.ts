/** Product-owned Mobile projection of authenticated Desktop Companion state. */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ConversationSnapshot, SessionId, SessionListState, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import { companionMayMutate, type CompanionForegroundRuntime } from './companion-lifecycle.ts'
import { requireCompanionMutation, type CompanionMutationName } from './companion-mutation.ts'
import {
  adaptMobileCompanionProjection,
  assertCompanionJsonProjection,
  type MobileCompanionProjectionDto,
  type MobilePendingSettlement,
  type MobilePendingSettlementReceipt,
} from './companion-projection.ts'

/** Authenticated JSON Desktop projection accepted for one physical connection. */
export type ValidatedDesktopSurfaceResync = MobileCompanionProjectionDto

/** Receiver installed beside one authenticated decoder generation. */
export interface ValidatedDesktopSurfaceResyncReceiver {
  /** @param message - decoded projection authenticated for this receiver's physical connection. */
  acceptValidatedDesktopResync(message: ValidatedDesktopSurfaceResync): void
}

/** Current Desktop-confirmed content retained while a replacement connection resynchronizes. */
export interface MobileCompanionSurfaceSnapshot {
  /** Desktop display name from the last authenticated resync. */
  readonly desktopName?: string | undefined
  /** Last authenticated Session projection. */
  readonly sessions: SessionListState
  /** Last authenticated Workspace projection. */
  readonly workspaces: readonly WorkspaceView[]
  /** Last authenticated opened conversations. */
  readonly conversations: Readonly<Partial<Record<SessionId, ConversationSnapshot>>>
}

/** Encrypted mutation channel owned by one authenticated physical connection. */
interface MobileCompanionMutationChannel {
  /** @param input - Desktop-default Session target. */
  create(input: { workspace?: string }): void
  /** @param sessionId - Desktop Session target. @param text - prompt text. */
  submit(sessionId: string, text: string): void
  /** @param sessionId - Desktop Session target. */
  cancel(sessionId: string): void
  /** @param sessionId - Desktop Session target. */
  attach(sessionId: string): void
  /** @param sessionId - Desktop Session whose preceding window is requested. */
  loadOlder(sessionId: string): void
  /** @param settlement - interaction id and owner-encoded result. @returns Desktop carrier receipt. */
  settle(settlement: MobilePendingSettlement): Promise<MobilePendingSettlementReceipt>
}

/** Authenticated content channel owned by one physical connection. */
interface MobileCompanionContentChannel {
  /** Read one authorized historical image from the selected Desktop Session. */
  loadImage(sessionId: string, attachment: ImageAttachmentRef): Promise<string>
}

/** Content and mutation adapters installed atomically with one decoder receiver. */
export interface MobileCompanionConnectionChannel {
  readonly mutations: MobileCompanionMutationChannel
  readonly content: MobileCompanionContentChannel
}

interface ActiveConnection {
  readonly token: symbol
  readonly channel: MobileCompanionConnectionChannel
}

/** Generation-bound Desktop projection plus fail-closed Mobile mutation callbacks. */
export class MobileCompanionSurface {
  readonly #runtime: CompanionForegroundRuntime
  readonly #listeners = new Set<() => void>()
  #activeConnection: ActiveConnection | undefined
  #snapshot: MobileCompanionSurfaceSnapshot = {
    sessions: {
      ids: [], byId: {}, current: undefined, phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    },
    workspaces: [],
    conversations: {},
  }

  /** @param runtime - current physical-connection synchronization authority. */
  constructor(runtime: CompanionForegroundRuntime) {
    this.#runtime = runtime
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

  /** @returns whether current synchronization and its bound encrypted channel admit mutations. */
  mayMutate(): boolean {
    return this.#activeConnection !== undefined && companionMayMutate(this.#runtime.getState())
  }

  /**
   * Bind one decoder receiver, content adapter, and mutation adapter to the current physical generation.
   * Raw Relay ciphertext cannot call this receiver. The binding becomes active only after its first valid resync.
   * @param channel - adapters owned by the same authenticated decoder generation.
   * @returns generation-bound receiver, or `undefined` while disconnected.
   */
  bindAuthenticatedConnection(
    channel: MobileCompanionConnectionChannel,
  ): ValidatedDesktopSurfaceResyncReceiver | undefined {
    const lifecycleReceiver = this.#runtime.bindValidatedDesktopResync()
    if (lifecycleReceiver === undefined) return undefined
    const token = Symbol('mobile-companion-connection')
    return {
      acceptValidatedDesktopResync: (message) => {
        assertCompanionJsonProjection(message)
        const active = { token, channel }
        const projection = adaptMobileCompanionProjection(
          message,
          settlement => this.settlePending(active, settlement),
        )
        const accepted = lifecycleReceiver.acceptValidatedDesktopResync(message)
        if (!accepted) return
        this.#activeConnection = active
        this.#snapshot = projection
        this.publish()
      },
    }
  }

  /** @param input - Desktop-default Session target. */
  readonly create = (input: { workspace?: string }): void => {
    this.transmit('session-create', (channel) => { channel.mutations.create(input) })
  }

  /** @param sessionId - Desktop Session target. @param text - prompt text. */
  readonly submit = (sessionId: string, text: string): void => {
    this.transmit('prompt', (channel) => { channel.mutations.submit(sessionId, text) })
  }

  /** @param sessionId - Desktop Session target. */
  readonly cancel = (sessionId: string): void => {
    this.transmit('cancel', (channel) => { channel.mutations.cancel(sessionId) })
  }

  /** @param sessionId - Desktop Session target. */
  readonly attach = (sessionId: string): void => {
    this.transmit('attachment', (channel) => { channel.mutations.attach(sessionId) })
  }

  /** @param sessionId - Desktop Session whose preceding window is requested. */
  readonly loadOlder = (sessionId: string): void => {
    this.transmit('history', (channel) => { channel.mutations.loadOlder(sessionId) })
  }

  /** Read one historical image through the current authenticated content adapter. */
  readonly loadImage = async (sessionId: string, attachment: ImageAttachmentRef): Promise<string> => {
    const active = this.requireActive('other-mutation')
    const result = await active.channel.content.loadImage(sessionId, attachment)
    if (this.#activeConnection?.token !== active.token || !companionMayMutate(this.#runtime.getState())) {
      throw new Error('Companion content response belongs to a stale connection generation')
    }
    return result
  }

  private transmit(
    kind: CompanionMutationName,
    send: (channel: MobileCompanionConnectionChannel) => void,
  ): void {
    const active = this.requireActive(kind)
    send(active.channel)
  }

  private requireActive(kind: CompanionMutationName): ActiveConnection {
    requireCompanionMutation(this.#runtime.getState(), kind)
    if (this.#activeConnection === undefined) {
      throw new Error('Companion authenticated connection channel is unavailable')
    }
    return this.#activeConnection
  }

  private settlePending(
    expected: ActiveConnection,
    settlement: MobilePendingSettlement,
  ): Promise<MobilePendingSettlementReceipt> {
    const active = this.requireActive(settlement.kind)
    if (active.token !== expected.token) {
      return Promise.reject(new Error('Companion pending interaction belongs to a stale connection generation'))
    }
    return active.channel.mutations.settle(settlement)
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
