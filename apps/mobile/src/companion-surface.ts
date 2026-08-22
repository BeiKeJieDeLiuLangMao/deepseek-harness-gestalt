/** Product-owned Mobile projection of authenticated Desktop Companion state. */

import type { CompanionInteraction } from './companion-approval.ts'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionListState, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import type { CompanionConversationMap } from './companion-history.ts'
import { companionMayMutate, type CompanionForegroundRuntime } from './companion-lifecycle.ts'
import { requireCompanionMutation, type CompanionMutationName } from './companion-mutation.ts'

interface ValidatedDesktopSurfaceResync {
  readonly type: 'desktop-resync'
  readonly version: 1
  readonly authenticated: true
  readonly desktopName: string
  readonly sessions: SessionListState
  readonly workspaces: readonly WorkspaceView[]
  readonly conversations: CompanionConversationMap
}

interface ValidatedDesktopSurfaceResyncReceiver {
  /** @param message - decoded projection authenticated for the receiver's physical connection. */
  acceptValidatedDesktopResync(message: ValidatedDesktopSurfaceResync): void
}

/** Current Desktop-confirmed content retained while a replacement connection resynchronizes. */
interface MobileCompanionSurfaceSnapshot {
  /** Desktop display name from the last authenticated resync. */
  readonly desktopName?: string | undefined
  /** Last authenticated Session projection. */
  readonly sessions: SessionListState
  /** Last authenticated Workspace projection. */
  readonly workspaces: readonly WorkspaceView[]
  /** Last authenticated opened conversations. */
  readonly conversations: CompanionConversationMap
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
  attach(sessionId: string): void
  /** @param interaction - Desktop-authorized approval or question settlement. */
  settle(interaction: CompanionInteraction): void
}

/** Authenticated Companion content adapter installed beside the decoder. */
export interface MobileCompanionContentChannel {
  /** Read one authorized historical image from the selected Desktop Session. */
  loadImage(sessionId: string, attachment: ImageAttachmentRef): Promise<string>
}

/** Generation-bound Desktop projection plus fail-closed Mobile mutation callbacks. */
export class MobileCompanionSurface {
  readonly #runtime: CompanionForegroundRuntime
  readonly #mutations: MobileCompanionMutationChannel | undefined
  readonly #content: MobileCompanionContentChannel | undefined
  readonly #listeners = new Set<() => void>()
  #snapshot: MobileCompanionSurfaceSnapshot = {
    sessions: {
      ids: [], byId: {}, current: undefined, phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    },
    workspaces: [],
    conversations: {},
  }

  /**
   * @param runtime - current physical-connection synchronization authority.
   * @param mutations - encrypted mutation channel; omitted until its decoder owns this surface.
   * @param content - authenticated content adapter; omitted until its decoder owns attachment reads.
   */
  constructor(
    runtime: CompanionForegroundRuntime,
    mutations?: MobileCompanionMutationChannel,
    content?: MobileCompanionContentChannel,
  ) {
    this.#runtime = runtime
    this.#mutations = mutations
    this.#content = content
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

  /** @returns whether current synchronization and an installed encrypted channel both admit mutations. */
  mayMutate(): boolean {
    return this.#mutations !== undefined && companionMayMutate(this.#runtime.getState())
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
          desktopName: message.desktopName,
          sessions: message.sessions,
          workspaces: message.workspaces,
          conversations: message.conversations,
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

  /** @param sessionId - Desktop Session target. */
  readonly attach = (sessionId: string): void => {
    this.transmit('attachment', (channel) => { channel.attach(sessionId) })
  }

  /** @param interaction - Desktop-authorized approval or question settlement. */
  readonly settle = (interaction: CompanionInteraction): void => {
    this.transmit(interaction.kind === 'approval' ? 'approval' : 'question', (channel) => { channel.settle(interaction) })
  }

  /** Read one historical image through the authenticated content adapter. */
  readonly loadImage = async (sessionId: string, attachment: ImageAttachmentRef): Promise<string> => {
    if (this.#content === undefined) throw new Error('Companion authenticated content channel is unavailable')
    return await this.#content.loadImage(sessionId, attachment)
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
