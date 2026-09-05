/**
 * Browser object layer over generated `memberQuestion` snapshot and settle.
 * Receiving Session faces and PendingWait remain session-controller-owned.
 * @module @deepseek-ai/dsh-client-ui-member-questions/client/remote-controller
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  MemberQuestionReceiverChange,
  MemberQuestionReceiverSnapshot,
  MemberQuestionRemoteSettleRequest,
  MemberQuestionRemoteSettleResponse,
} from '@deepseek-ai/dsh-member-question-receiver/types'

/** Load state of the one snapshot that seeds this Client. */
export type MemberQuestionRemoteStatus = 'cold' | 'loading' | 'ready' | 'error'

/** Immutable view published after snapshot, settle, or a forwarded change. */
export interface MemberQuestionRemoteView {
  readonly status: MemberQuestionRemoteStatus
  readonly snapshot: MemberQuestionReceiverSnapshot | null
  readonly error: { readonly code: string; readonly message: string } | null
  /** Last settle request retained while the Host rejected it. */
  readonly draft: MemberQuestionRemoteSettleRequest | null
}

/** Settled action returned to inject callbacks. */
export type MemberQuestionRemoteActionResult =
  | { readonly ok: true; readonly value?: MemberQuestionRemoteSettleResponse }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

const EMPTY_SNAPSHOT: MemberQuestionReceiverSnapshot = Object.freeze({
  revision: 0,
  pending: Object.freeze([]),
  terminal: Object.freeze([]),
})

const INITIAL_VIEW: MemberQuestionRemoteView = Object.freeze({
  status: 'cold',
  snapshot: null,
  error: null,
  draft: null,
})

const OK: MemberQuestionRemoteActionResult = Object.freeze({ ok: true })

const DISPOSED: MemberQuestionRemoteActionResult = Object.freeze({
  ok: false,
  error: Object.freeze({ code: 'disposed', message: 'member-question remote controller is disposed' }),
})

/**
 * Host-facing snapshot/settle consumer. Apply owns one instance; React never
 * receives this object except through the inject `hooks` compartment.
 */
export class MemberQuestionRemoteController implements HostObservable<MemberQuestionRemoteView> {
  private view: MemberQuestionRemoteView = INITIAL_VIEW
  private readonly listeners = new Set<() => void>()
  private loadPromise: Promise<MemberQuestionRemoteActionResult> | null = null
  private disposed = false

  /**
   * @param ctx - browser plugin context carrying `remote.memberQuestion`.
   */
  constructor(private readonly ctx: ClientContext) {}

  /** Return the cached immutable view. */
  getSnapshot = (): MemberQuestionRemoteView => this.view

  /** Subscribe to view replacement. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Load once; a failed load stays retryable.
   * @returns the settled load result, shared by concurrent callers.
   */
  ensure(): Promise<MemberQuestionRemoteActionResult> {
    if (this.view.status === 'ready') return Promise.resolve(OK)
    return this.refresh()
  }

  /**
   * Re-read the authoritative snapshot, collapsing concurrent callers.
   * @returns the settled load result.
   */
  refresh(): Promise<MemberQuestionRemoteActionResult> {
    if (this.disposed) return Promise.resolve(DISPOSED)
    this.loadPromise ??= this.load().finally(() => { this.loadPromise = null })
    return this.loadPromise
  }

  /**
   * Apply one Host change by re-reading the complete snapshot.
   * @param _change - forwarded ledger commit; identity is unused because snapshot is complete.
   */
  handleChanged(_change: MemberQuestionReceiverChange): void {
    if (this.disposed) return
    void this.refresh()
  }

  /**
   * Settle one pending question through the generated Remote.
   * A rejected call retains `request` as the draft so retry can resend it.
   * @param request - exact Host settlement payload (no Installation identity or settledAt).
   * @returns the generated settle result.
   */
  async settle(request: MemberQuestionRemoteSettleRequest): Promise<MemberQuestionRemoteActionResult> {
    if (this.disposed) return DISPOSED
    const carried = await this.ctx.remote.memberQuestion.settle(request)
    if (this.disposed) return DISPOSED
    return this.finishSettle(request, carried)
  }

  /**
   * Resend the retained draft after an error or stale revision.
   * @returns the generated settle result, or a no-draft error.
   */
  retry(): Promise<MemberQuestionRemoteActionResult> {
    const draft = this.view.draft
    if (draft === null) {
      return Promise.resolve({
        ok: false,
        error: { code: 'no-draft', message: 'no retained member-question settle draft' },
      })
    }
    return this.settle(draft)
  }

  /** Drop subscribers and refuse further Remote writes when the owning fiber unloads. */
  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }

  private async load(): Promise<MemberQuestionRemoteActionResult> {
    if (this.view.status !== 'ready') {
      this.publish({ ...this.view, status: 'loading', error: null })
    }
    const carried = await this.ctx.remote.memberQuestion.snapshot()
    if (this.disposed) return DISPOSED
    if (!carried.ok) {
      this.publish({
        status: 'error',
        snapshot: this.view.snapshot,
        error: { code: carried.error.code, message: carried.error.message },
        draft: this.view.draft,
      })
      return { ok: false, error: { code: carried.error.code, message: carried.error.message } }
    }
    this.publish({
      status: 'ready',
      snapshot: carried.value,
      error: null,
      draft: this.view.draft,
    })
    return OK
  }

  private finishSettle(
    request: MemberQuestionRemoteSettleRequest,
    carried: RemoteResult<MemberQuestionRemoteSettleResponse>,
  ): MemberQuestionRemoteActionResult {
    if (!carried.ok) {
      this.publish({
        status: this.view.status === 'cold' ? 'error' : this.view.status,
        snapshot: this.view.snapshot ?? EMPTY_SNAPSHOT,
        error: { code: carried.error.code, message: carried.error.message },
        draft: request,
      })
      if (carried.error.code === 'member-question/revision-stale') void this.refresh()
      return { ok: false, error: { code: carried.error.code, message: carried.error.message } }
    }
    this.publish({
      status: 'ready',
      snapshot: this.view.snapshot,
      error: null,
      draft: null,
    })
    void this.refresh()
    return { ok: true, value: carried.value }
  }

  private publish(next: MemberQuestionRemoteView): void {
    this.view = next
    for (const listener of [...this.listeners]) listener()
  }
}
