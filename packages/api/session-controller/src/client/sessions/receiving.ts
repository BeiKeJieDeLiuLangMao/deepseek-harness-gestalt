/**
 * Host-snapshot adapter for model-silent member-question receiving Sessions.
 * Generated `memberQuestion` Remote is the only Host path. The book projects
 * JSON pending rows; UI owns PendingQuestion and drafts.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  AskUserQuestionAnswer, AskUserQuestionItem,
} from '@deepseek-ai/dsh-user-questions/types'
import type {
  MemberQuestionReceiverChange,
  MemberQuestionReceiverSnapshot,
  MemberQuestionRemoteSettleRequest,
  TerminalMemberQuestionView,
} from '@deepseek-ai/dsh-member-question-receiver/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
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

/** JSON pending row projected from one Host pending view. */
export interface ReceivingPendingQuestion {
  readonly sessionId: SessionId
  readonly questionId: string
  readonly revision: number
  readonly questions: readonly AskUserQuestionItem[]
  readonly intent: MemberQuestionIntent
}

/** One Host-owned receiving Session projection. */
export interface ReceivingSessionRow {
  readonly sessionId: SessionId
  readonly title: string
  readonly updatedAt: number
  readonly revision: number
  readonly materialized: boolean
  readonly pending: ReceivingPendingQuestion | undefined
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

/**
 * Build the receiving row title from the Host brief origin.
 * @param origin - carried project and source-Session identity.
 * @returns the visible source line.
 */
export function briefSourceLine(origin: MemberQuestionIntent['origin']): string {
  return `${origin.projectName} — ${origin.originSessionTitle}`
}

/**
 * Read one shared member-question intent from a complete question batch.
 * @param questions - questions expected to carry one identical intent.
 * @returns the shared intent, or undefined for a mixed or generic batch.
 */
export function memberQuestionIntentOf(
  questions: readonly AskUserQuestionItem[],
): MemberQuestionIntent | undefined {
  const first = questions[0]?.intent
  if (first?.kind !== 'member-question') return undefined
  const shared = JSON.stringify(first)
  return questions.slice(1).some(question => JSON.stringify(question.intent) !== shared)
    ? undefined
    : first
}

/** Project one authoritative Host snapshot into identity-stable receiving rows. */
export class ReceivingQuestionBook implements ObservableSnapshot<ReceivingQuestionBookView> {
  readonly #ctx: Context
  readonly #onChange: () => void
  readonly #listeners = new Set<() => void>()
  #currentInstallationId: string | undefined
  readonly #rows = new Map<SessionId, ReceivingSessionRow>()
  #view: ReceivingQuestionBookView = { byId: {} }
  #revision = -1
  #offChanged: (() => void) | undefined
  #disposed = false
  #load: Promise<void> | undefined

  constructor(
    ctx: Context,
    options: ReceivingQuestionBookOptions & { onChange?: () => void } = {},
  ) {
    this.#ctx = ctx
    this.#onChange = options.onChange ?? (() => {})
    this.#currentInstallationId = options.currentInstallationId
  }

  /** Return the cached receiving rows. */
  getSnapshot = (): ReceivingQuestionBookView => this.#view

  /** Subscribe to row replacement. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /**
   * Subscribe to forwarded ledger commits and load the generated snapshot.
   * @returns completion of the first snapshot.
   */
  start(): Promise<void> {
    if (this.#disposed) return Promise.reject(new Error('receiving question book is disposed'))
    this.#offChanged ??= this.#ctx.remote.$on(
      'member-question-receiver/changed',
      (change: MemberQuestionReceiverChange) => { this.handleChanged(change) },
    )
    return this.refresh()
  }

  /**
   * Re-read the complete Host snapshot, collapsing concurrent callers.
   * @returns completion of the in-flight load.
   */
  refresh(): Promise<void> {
    if (this.#disposed) return Promise.resolve()
    this.#load ??= this.load().finally(() => { this.#load = undefined })
    return this.#load
  }

  /**
   * Apply one forwarded ledger commit by re-reading the complete snapshot.
   * @param _change - durable revision, question identity, and committed state.
   */
  handleChanged(_change: MemberQuestionReceiverChange): void {
    void this.refresh()
  }

  /**
   * The JSON pending row for one receiving Session, when pending.
   * @param sessionId - Host receiving Session identity.
   * @returns the unique pending DTO, or undefined.
   */
  pending(sessionId: SessionId): ReceivingPendingQuestion | undefined {
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
   * Settle the current pending row of one receiving Session through generated Remote.
   * Failures leave the snapshot unchanged except a stale revision, which refreshes.
   * @param sessionId - Host receiving Session identity.
   * @param response - human answer or decline.
   * @returns completion of the Remote write.
   */
  settle(sessionId: SessionId, response: ReceivingQuestionSettleResponse): Promise<void> {
    if (this.#disposed) return Promise.reject(new Error('receiving question book is disposed'))
    const row = this.#rows.get(sessionId)
    const pending = row?.pending
    if (pending === undefined) {
      return Promise.reject(new Error('receiving question has no pending row'))
    }
    const request: MemberQuestionRemoteSettleRequest = {
      receivingSessionId: pending.sessionId as never,
      revision: pending.revision,
      questionId: pending.questionId as never,
      response,
    }
    return this.#ctx.remote.memberQuestion.settle(request).then((carried) => {
      if (!carried.ok) {
        if (carried.error.code === 'member-question/revision-stale') void this.refresh()
        throw new Error(carried.error.message)
      }
      void this.refresh()
    })
  }

  /** Release projected rows and refuse further Remote writes. */
  dispose(): void {
    this.#disposed = true
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

  private async load(): Promise<void> {
    const carried = await this.#ctx.remote.memberQuestion.snapshot()
    if (this.#disposed) return
    if (!carried.ok) return
    this.applySnapshot(carried.value)
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
      ? intentOf(exemplar, accountId, pendingRow?.cachedReferences)
      : intentOf(pendingRow.operation, pendingRow.receivingAccountId, pendingRow.cachedReferences)
    const pending = pendingRow === undefined ? undefined : {
      sessionId,
      questionId: pendingRow.questionId,
      revision: pendingRow.revision,
      questions: questionsOf(pendingRow, intent),
      intent,
    }
    const updatedAt = Math.max(pendingRow?.arrivedAt ?? 0, ...records.map(record => record.terminalAt))
    const revision = Math.max(pendingRow?.revision ?? 0, ...group.terminal.map(record => record.revision))
    this.#rows.set(sessionId, {
      sessionId,
      title: briefSourceLine(intent.origin),
      updatedAt,
      revision,
      materialized: pendingRow?.hostSessionId !== undefined
        || group.terminal.some(record => record.hostSessionId !== undefined),
      pending,
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

function questionsOf(
  pending: MemberQuestionReceiverSnapshot['pending'][number],
  intent: MemberQuestionIntent,
): AskUserQuestionItem[] {
  return pending.operation.questions.map(question => ({
    id: question.id,
    question: question.question,
    ...(question.header === undefined ? {} : { header: question.header }),
    ...(question.options === undefined ? {} : { options: question.options.map(option => ({ ...option })) }),
    ...(question.multiSelect === undefined ? {} : { multiSelect: question.multiSelect }),
    intent,
  }))
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
