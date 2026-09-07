/**
 * Host-snapshot adapter for model-silent member-question receiving Sessions.
 * Generated `memberQuestion` Remote is the only Host path. The book stores
 * Host pending views; UI owns PendingQuestion and drafts.
 */
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types'
import type {
  MemberQuestionReceiverChange,
  MemberQuestionReceiverSnapshot,
  MemberQuestionRemoteSettleRequest,
  PendingMemberQuestionView,
  TerminalMemberQuestionView,
} from '@deepseek-ai/dsh-member-question-receiver/types'
import type {} from '@deepseek-ai/dsh-member-question-receiver/remote'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** Carried presentation intent for a routed member question. */
export type MemberQuestionIntent = Extract<
  NonNullable<AskUserQuestionItem['intent']>,
  { kind: 'member-question' }
>

/** Client presentation states projected from Host terminal records. */
export type ReceivingMemberQuestionState =
  | 'pending' | 'answered' | 'answered-elsewhere' | 'declined'
  | 'expired' | 'withdrawn' | 'superseded'

/** Host-projected terminal record band. */
export interface ReceivingMemberQuestionRecord {
  readonly questionId: string
  readonly state: ReceivingMemberQuestionState
  readonly askedAt: number
  readonly terminalAt: number
  readonly intent: MemberQuestionIntent
  readonly settledByDeviceName?: string
}

/** One Host-owned receiving Session projection. */
export interface ReceivingSessionRow {
  readonly sessionId: SessionId
  readonly title: string
  readonly updatedAt: number
  readonly revision: number
  readonly materialized: boolean
  readonly pending: PendingMemberQuestionView | undefined
  readonly records: readonly ReceivingMemberQuestionRecord[]
}

/** Client-only identity used to derive answered-elsewhere presentation. */
export interface ReceivingQuestionBookOptions {
  readonly currentInstallationId?: string
}

/** Immutable receiving projection keyed by Host receiving Session. */
export interface ReceivingQuestionBookView {
  readonly byId: Readonly<Record<string, ReceivingSessionRow>>
}

/** Human response forwarded to generated memberQuestion.settle. */
export type ReceivingQuestionSettleResponse =
  | { readonly kind: 'answered'; readonly answers: AskUserQuestionAnswer['answers'] }
  | { readonly kind: 'declined' }

const EMPTY: readonly never[] = []

type ReceivingQuestionRemote = Pick<ClientRemote, '$on' | 'memberQuestion'>

/**
 * Build the receiving row title from the Host brief origin.
 * @param origin - carried project and source-Session identity.
 * @returns the visible source line.
 */
export function briefSourceLine(origin: MemberQuestionIntent['origin']): string {
  return `${origin.projectName} — ${origin.originSessionTitle}`
}

/** Project one authoritative Host snapshot into identity-stable receiving rows. */
export class ReceivingQuestionBook implements ObservableSnapshot<ReceivingQuestionBookView> {
  readonly #remote: ReceivingQuestionRemote
  readonly #onChange: () => void
  readonly #listeners = new Set<() => void>()
  #currentInstallationId: string | undefined
  readonly #rows = new Map<SessionId, ReceivingSessionRow>()
  #view: ReceivingQuestionBookView = { byId: {} }
  #revision = -1
  #offChanged: (() => void) | undefined
  #disposed = false
  #load: Promise<void> | undefined
  #dirty = false

  constructor(
    remote: ReceivingQuestionRemote,
    options: ReceivingQuestionBookOptions & { onChange?: () => void } = {},
  ) {
    this.#remote = remote
    this.#onChange = options.onChange ?? (() => {})
    this.#currentInstallationId = options.currentInstallationId
  }

  /** Return the cached receiving rows. */
  getSnapshot: () => ReceivingQuestionBookView = () => this.#view

  /** Subscribe to row replacement. */
  subscribe: (listener: () => void) => () => void = (listener) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /**
   * Subscribe to forwarded ledger commits and load the generated snapshot.
   * @returns completion of the first snapshot.
   */
  start(): Promise<void> {
    if (this.#disposed) return Promise.reject(new Error('receiving question book is disposed'))
    this.#offChanged ??= this.#remote.$on(
      'member-question-receiver/changed',
      (change: MemberQuestionReceiverChange) => { this.handleChanged(change) },
    )
    return this.refresh()
  }

  /**
   * Re-read the complete Host snapshot, collapsing concurrent callers.
   * A `changed` or settle that arrives during an in-flight snapshot marks a
   * follow-up load; waiters of the in-flight load wait until that drain
   * finishes. Dispose cancels the follow-up. A failed snapshot does not loop.
   * @returns completion of the in-flight load, including any dirty drain.
   */
  refresh(): Promise<void> {
    if (this.#disposed) return Promise.resolve()
    if (this.#load !== undefined) {
      this.#dirty = true
      return this.#load
    }
    const flight = this.drain()
    this.#load = flight
    return flight
  }

  /**
   * Apply one forwarded ledger commit by re-reading the complete snapshot.
   * @param _change - durable revision, question identity, and committed state.
   */
  handleChanged(_change: MemberQuestionReceiverChange): void {
    void this.refresh()
  }

  /**
   * The Host pending view for one receiving Session, when pending.
   * @param sessionId - Host receiving Session identity.
   * @returns the Host pending row, or undefined.
   */
  pending(sessionId: SessionId): PendingMemberQuestionView | undefined {
    return this.#rows.get(sessionId)?.pending
  }

  /**
   * Terminal records for one receiving Session.
   * @param sessionId - Host receiving Session identity.
   * @returns the projected terminal bands.
   */
  records(sessionId: SessionId): readonly ReceivingMemberQuestionRecord[] {
    return this.#rows.get(sessionId)?.records ?? EMPTY
  }

  /**
   * List the current Host-projected receiving rows.
   * @returns the receiving rows.
   */
  rows(): readonly ReceivingSessionRow[] { return [...this.#rows.values()] }

  /**
   * Answer the current pending row through generated Remote.
   * Failures leave the snapshot unchanged except a stale revision, which refreshes.
   * @param sessionId - Host receiving Session identity.
   * @param answers - structured answer batch.
   * @returns completion of the Remote write.
   */
  settle(sessionId: SessionId, answers: AskUserQuestionAnswer['answers']): Promise<void> {
    return this.write(sessionId, { kind: 'answered', answers })
  }

  /**
   * Decline the current pending row through generated Remote.
   * @param sessionId - Host receiving Session identity.
   * @returns completion of the Remote write.
   */
  decline(sessionId: SessionId): Promise<void> {
    return this.write(sessionId, { kind: 'declined' })
  }

  private write(sessionId: SessionId, response: ReceivingQuestionSettleResponse): Promise<void> {
    if (this.#disposed) return Promise.reject(new Error('receiving question book is disposed'))
    const pending = this.#rows.get(sessionId)?.pending
    if (pending === undefined) {
      return Promise.reject(new Error('receiving question has no pending row'))
    }
    const request: MemberQuestionRemoteSettleRequest = {
      receivingSessionId: pending.receivingSessionId,
      revision: pending.revision,
      questionId: pending.questionId,
      response,
    }
    return this.#remote.memberQuestion.settle(request).then((carried) => {
      if (!carried.ok) {
        if (carried.error.code === 'member-question/revision-stale') {
          return this.refresh().then(() => {
            throw new Error(carried.error.message)
          })
        }
        throw new Error(carried.error.message)
      }
      return this.refresh()
    })
  }

  /** Release projected rows and refuse further Remote writes. */
  dispose(): void {
    this.#disposed = true
    this.#dirty = false
    this.#offChanged?.()
    this.#offChanged = undefined
    this.#rows.clear()
    this.publishView()
    this.#listeners.clear()
  }

  private publishView(): void {
    const byId: Record<string, ReceivingSessionRow> = {}
    for (const [sessionId, row] of this.#rows) byId[sessionId] = row
    this.#view = { byId }
    for (const listener of [...this.#listeners]) listener()
  }

  private async drain(): Promise<void> {
    try {
      for (;;) {
        const applied = await this.load()
        if (!applied || this.#disposed) return
        if (!this.#dirty) return
        this.#dirty = false
      }
    } finally {
      this.#load = undefined
    }
  }

  private async load(): Promise<boolean> {
    const carried = await this.#remote.memberQuestion.snapshot()
    if (this.#disposed) return false
    if (!carried.ok) return false
    this.applySnapshot(carried.value)
    return true
  }

  /**
   * Replace browser state from one higher-revision complete Host projection.
   * @param snapshot - complete committed receiver projection.
   * @param currentInstallationId - authenticated Client Installation used only for answered-elsewhere display.
   */
  applySnapshot(snapshot: MemberQuestionReceiverSnapshot, currentInstallationId?: string): void {
    if (snapshot.revision <= this.#revision) return
    if (currentInstallationId !== undefined) this.#currentInstallationId = currentInstallationId
    this.#revision = snapshot.revision
    const sessionIds = new Set<SessionId>()
    const groups = new Map<SessionId, {
      pending: MemberQuestionReceiverSnapshot['pending'][number] | undefined
      terminal: MemberQuestionReceiverSnapshot['terminal']
    }>()
    for (const pending of snapshot.pending) {
      const sessionId = pending.receivingSessionId as unknown as SessionId
      sessionIds.add(sessionId)
      groups.set(sessionId, { pending, terminal: [] })
    }
    for (const terminal of snapshot.terminal) {
      const sessionId = terminal.receivingSessionId as unknown as SessionId
      sessionIds.add(sessionId)
      const group = groups.get(sessionId) ?? { pending: undefined, terminal: [] }
      group.terminal = [...group.terminal, terminal]
      groups.set(sessionId, group)
    }
    for (const [sessionId, group] of groups) this.projectGroup(sessionId, group)
    for (const sessionId of [...this.#rows.keys()]) {
      if (sessionIds.has(sessionId)) continue
      this.#rows.delete(sessionId)
    }
    this.publishView()
    this.#onChange()
  }

  private projectGroup(
    sessionId: SessionId,
    group: {
      pending: MemberQuestionReceiverSnapshot['pending'][number] | undefined
      terminal: MemberQuestionReceiverSnapshot['terminal']
    },
  ): void {
    const exemplar = group.pending?.operation ?? group.terminal.at(-1)?.brief
    if (exemplar === undefined) return
    const accountId = group.pending?.receivingAccountId ?? group.terminal[0]?.receivingAccountId
    if (accountId === undefined) return
    const records = group.terminal.flatMap(view => this.recordOf(view))
    const pendingRow = group.pending
    const intent = pendingRow === undefined
      ? intentOf(exemplar, accountId, undefined)
      : intentOf(pendingRow.operation, pendingRow.receivingAccountId, pendingRow.cachedReferences)
    const updatedAt = Math.max(pendingRow?.arrivedAt ?? 0, ...records.map(record => record.terminalAt))
    const revision = Math.max(pendingRow?.revision ?? 0, ...group.terminal.map(record => record.revision))
    this.#rows.set(sessionId, {
      sessionId,
      title: briefSourceLine(intent.origin),
      updatedAt,
      revision,
      materialized: pendingRow?.hostSessionId !== undefined
        || group.terminal.some(record => record.hostSessionId !== undefined),
      pending: pendingRow,
      records,
    })
  }

  private recordOf(view: TerminalMemberQuestionView): ReceivingMemberQuestionRecord[] {
    const terminal = view.terminal
    if (terminal.outcome === 'answered'
      && (this.#currentInstallationId === undefined
        || terminal.settledByInstallationId === this.#currentInstallationId)) {
      return []
    }
    const state: ReceivingMemberQuestionState = terminal.outcome === 'answered'
      ? 'answered-elsewhere'
      : terminal.outcome
    return [{
      questionId: view.questionId,
      state,
      askedAt: view.arrivedAt,
      terminalAt: terminal.settledAt,
      intent: intentOf(view.brief, view.receivingAccountId, view.cachedReferences),
      ...(terminal.outcome === 'answered' || terminal.outcome === 'declined'
        ? { settledByDeviceName: terminal.settledByDeviceName }
        : {}),
    }]
  }
}

function intentOf(
  operation: MemberQuestionReceiverSnapshot['pending'][number]['operation']
    | MemberQuestionReceiverSnapshot['terminal'][number]['brief'],
  receivingAccountId: string,
  cachedReferences?: readonly { path: string; cachedPath: string }[],
): MemberQuestionIntent {
  return {
    kind: 'member-question',
    questionId: operation.questionId,
    originSessionId: operation.originSessionId,
    toProjectMember: receivingAccountId,
    origin: operation.origin,
    background: operation.background,
    references: operation.references.map((reference) => {
      const cached = cachedReferences?.find(entry => entry.path === reference.path)?.cachedPath
      return {
        ...reference,
        ...(cached === undefined ? {} : { cachedPath: cached }),
      }
    }),
    expiresAt: operation.expiresAt,
  }
}
