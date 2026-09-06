/** Host Session materialization for authenticated member-question arrivals. */

import type { Context } from '@deepseek-ai/cordis'
import { freezeMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { MessageId } from '@deepseek-ai/dsh-llm/brand'
import {
  writeMemberQuestionDocumentCache,
  type MemberQuestionHumanTurnAdmissionContext,
  type MemberQuestionHumanTurnAdmitter,
  type MemberQuestionHumanTurnContent,
  type MemberQuestionSessionMaterializer,
  type TerminalMemberQuestionView,
} from '@deepseek-ai/dsh-member-question-receiver'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SessionAlreadyExistsError } from '@deepseek-ai/dsh-session-persistence'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { ApiSessionAgentController } from './agent.ts'
import type { SessionRequestId } from './types.ts'

/** Default delay between failed terminal Session sync attempts. */
export const DEFAULT_RECEIVING_TERMINAL_RETRY_MS = 1_000

/** Timer used by receiving terminal Session sync retries. */
export interface ReceivingTerminalRetryTimer {
  /** Schedule one callback. */
  set(callback: () => void, delayMs: number): unknown
  /** Cancel one scheduled callback. */
  clear(handle: unknown): void
}

/** Host options for arrival materialization and terminal Session sync. */
export interface ReceivingMaterializerOptions {
  /** Delay between failed terminal Session sync attempts. */
  readonly terminalRetryMs?: number
  /** Timer used by terminal retries; defaults to the process timer. */
  readonly timer?: ReceivingTerminalRetryTimer
}

/** Compact model-visible Decision Brief for one received operation. */
function decisionBrief(row: MemberQuestionHumanTurnAdmissionContext['questions'][number]): string {
  const brief = 'operation' in row ? row.operation : row.brief
  const questions = brief.questions.map((question) => {
    const options = question.options?.map(option => option.label).join(' | ')
    return options === undefined ? `- ${question.question}` : `- ${question.question}\n  Options: ${options}`
  }).join('\n')
  const references = brief.references.length === 0
    ? 'None'
    : brief.references.map(reference => `- ${reference.path}: ${reference.reason}`).join('\n')
  return [
    `Decision Brief from ${brief.origin.askerDisplayName} (${brief.origin.askerRole})`,
    `Project: ${brief.origin.projectName}`,
    `Origin Session: ${brief.origin.originSessionTitle}`,
    `Background: ${brief.background}`,
    'Questions:', questions,
    'References:', references,
  ].join('\n')
}

/** Whether one stable message identity already entered this Session or remains pending. */
function hasMessage(session: Session, messageId: string): boolean {
  return session.snapshotEvents().some((event) => {
    if (event.type === 'user/message') return event.data.id === messageId
    return event.type === 'agent/inbox/spliced'
      && event.data.inserted.some(message => message.id === messageId)
  })
}

/**
 * Register the single Host arrival materializer, human-turn admitter, and
 * terminal Session sync. Creates or continues the receiver-owned Session
 * identity, attaches the bound Workspace, records ignorable
 * `member-question/received` metadata, and injects the Decision Brief without
 * starting a model turn. After a durable terminal, appends ignorable
 * `member-question/settled` once and flushes. Failed flushes retry on the
 * configured timer. Human turns resume an already-materialized Session, mark
 * `source.kind=user` with the reserved rpcId, and steer or follow up. Dispose
 * cancels timers, refuses stale writes, waits for in-flight syncs, and
 * withdraws both registrations.
 * @param ctx - Host context with sessions, agents, and workspace registry.
 * @param agents - Session Controller Agent activation.
 * @param options - retry delay and timer.
 * @returns async disposer for this exact registration.
 */
export function installReceivingSessionMaterializer(
  ctx: Context,
  agents: ApiSessionAgentController,
  options: ReceivingMaterializerOptions = {},
): () => void | Promise<void> {
  const receiver = ctx.get('memberQuestionReceiver')
  if (receiver === undefined) {
    throw new Error('member-question receiver is required to install Host Session materialization')
  }
  const retryMs = options.terminalRetryMs ?? DEFAULT_RECEIVING_TERMINAL_RETRY_MS
  const timer = options.timer ?? { set: setTimeout, clear: clearTimeout }
  const terminalSyncs = new Map<string, Promise<void>>()
  const terminalRetryPending = new Map<string, TerminalMemberQuestionView>()
  const ownedTasks = new Set<Promise<unknown>>()
  let retryHandle: unknown
  let recoveryHandle: unknown
  let disposed = false

  const track = <T>(task: Promise<T>, cleanup?: () => void): Promise<T> => {
    ownedTasks.add(task)
    const settle = (): void => {
      ownedTasks.delete(task)
      cleanup?.()
    }
    void task.then(settle, settle)
    return task
  }

  const materializer: MemberQuestionSessionMaterializer = async (input, admission) => {
    const workspace = ctx.workspaceRegistry.get(WorkspaceId(admission.workspaceId))
    if (workspace === undefined) {
      throw new Error(`member-question binding references unknown Workspace ${admission.workspaceId}`)
    }
    const sessionId = input.receivingSessionId as unknown as SessionId
    const agent = await agents.ensureSession(sessionId, workspace.path, true)
    await workspace.attachSession(sessionId)
    const persistence = ctx.get('sessionPersistence')
    if (persistence !== undefined) {
      try {
        await persistence.create(agent.session.header)
      } catch (error: unknown) {
        if (!(error instanceof SessionAlreadyExistsError)) throw error
      }
    }
    const titles = ctx.get('sessionTitle')
    const origin = admission.questions[0] === undefined
      ? undefined
      : ('operation' in admission.questions[0] ? admission.questions[0].operation : admission.questions[0].brief).origin
    if (titles !== undefined && origin !== undefined && titles.get(agent.session) === undefined) {
      titles.rename(agent.session, `${origin.projectName} — ${origin.originSessionTitle}`)
    }
    const cachedByQuestion = new Map<string, NonNullable<typeof admission.questions[number]['cachedReferences']>>()
    for (const question of admission.questions) {
      if (question.cachedReferences !== undefined) {
        cachedByQuestion.set(String(question.questionId), question.cachedReferences)
      }
    }
    const currentQuestion = admission.questions.find((question): question is Extract<
      typeof admission.questions[number],
      { operation: unknown }
    > => !('terminal' in question) && question.cachedReferences === undefined)
    if (currentQuestion !== undefined) {
      cachedByQuestion.set(String(currentQuestion.questionId), await writeMemberQuestionDocumentCache({
        workspacePath: workspace.path,
        questionId: currentQuestion.questionId,
        references: currentQuestion.operation.references,
        documents: admission.documents,
      }))
    }
    for (const question of admission.questions) {
      const operation = 'operation' in question ? question.operation : question.brief
      const cachedReferences = cachedByQuestion.get(String(operation.questionId))
      if (!agent.session.snapshotEvents().some(event => event.type === 'member-question/received'
        && event.data.questionId === operation.questionId)) {
        agent.session.append('member-question/received', {
          questionId: operation.questionId,
          projectId: operation.projectId,
          originSessionId: operation.originSessionId as unknown as SessionId,
          arrivedAt: question.arrivedAt,
          expiresAt: operation.expiresAt,
          origin: operation.origin,
          background: operation.background,
          questions: operation.questions,
          references: operation.references,
          ...(cachedReferences === undefined ? {} : { cachedReferences }),
        }, { ignorable: true })
      }
      if ('terminal' in question && !agent.session.snapshotEvents().some(event =>
        event.type === 'member-question/settled'
        && event.data.questionId === question.terminal.questionId)) {
        agent.session.append('member-question/settled', question.terminal, { ignorable: true })
      }
      const briefId = MessageId(`member-question-brief:${operation.questionId}`)
      if (!hasMessage(agent.session, briefId)) {
        agent.inject(freezeMessage({
          id: briefId,
          role: 'user',
          content: [{ type: 'text', text: decisionBrief(question) }],
          source: { kind: 'plugin', plugin: 'member-question-receiver', form: 'relay' },
        }))
      }
    }
    await ctx.sessions.flush(agent.session)
    const cachedReferences = currentQuestion === undefined
      ? undefined
      : cachedByQuestion.get(String(currentQuestion.questionId))
    return {
      accepted: true as const,
      ...(cachedReferences === undefined ? {} : { cachedReferences }),
    }
  }

  const resolveWorkspace = async (view: TerminalMemberQuestionView) => {
    const binding = receiver.lookup(view.receivingAccountId, view.brief.projectId)
    const workspaceId = await binding
    if (workspaceId === undefined) {
      throw new Error('member-question admission requires exact local Workspace binding authority')
    }
    const workspace = ctx.workspaceRegistry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) {
      throw new Error(`member-question binding references unknown Workspace ${workspaceId}`)
    }
    return workspace
  }

  const persistWriter = async (header: Session['header']): Promise<void> => {
    const persistence = ctx.get('sessionPersistence')
    if (persistence === undefined) return
    try {
      await persistence.create(header)
    } catch (error: unknown) {
      if (!(error instanceof SessionAlreadyExistsError)) throw error
    }
  }

  const syncMaterializedTerminal = async (view: TerminalMemberQuestionView): Promise<void> => {
    if (disposed || view.hostSessionId === undefined) return
    const workspace = await resolveWorkspace(view)
    const sessionId = view.hostSessionId
    const agent = await agents.resumeExistingSession(sessionId, workspace.path)
    await workspace.attachSession(sessionId)
    await persistWriter(agent.session.header)
    if (!agent.session.snapshotEvents().some(event => event.type === 'member-question/settled'
      && event.data.questionId === view.questionId)) {
      agent.session.append('member-question/settled', view.terminal, { ignorable: true })
    }
    if (disposed) return
    await ctx.sessions.flush(agent.session)
  }

  const scheduleTerminalSync = (view: TerminalMemberQuestionView): Promise<void> => {
    if (disposed) return Promise.reject(new Error('member-question terminal sync is disposed'))
    const key = String(view.questionId)
    const task = (terminalSyncs.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => syncMaterializedTerminal(view))
    terminalSyncs.set(key, task)
    return track(task, () => {
      if (terminalSyncs.get(key) === task) terminalSyncs.delete(key)
    })
  }

  const queueTerminalRetry = (view: TerminalMemberQuestionView): void => {
    if (disposed) return
    terminalRetryPending.set(String(view.questionId), view)
    if (retryHandle !== undefined) return
    retryHandle = timer.set(() => {
      retryHandle = undefined
      void track(drainTerminalRetries())
    }, retryMs)
  }

  const drainTerminalRetries = async (): Promise<void> => {
    for (const [questionId, view] of [...terminalRetryPending]) {
      if (disposed) return
      try {
        await scheduleTerminalSync(view)
        terminalRetryPending.delete(questionId)
      } catch (error: unknown) {
        ctx.logger.error(`member-question terminal Session sync retry failed: ${String(error)}`)
      }
    }
    const next = terminalRetryPending.values().next().value
    if (next !== undefined) queueTerminalRetry(next)
  }

  const admissionContent = (content: readonly MemberQuestionHumanTurnContent[]): ContentBlock[] =>
    content.map(block => structuredClone(block))

  const admitter: MemberQuestionHumanTurnAdmitter = async (input, admission) => {
    if (disposed) throw new Error('member-question human admission is disposed')
    const workspace = ctx.workspaceRegistry.get(WorkspaceId(admission.workspaceId))
    if (workspace === undefined) {
      throw new Error(`member-question binding references unknown Workspace ${admission.workspaceId}`)
    }
    const sessionId = input.receivingSessionId as unknown as SessionId
    const agent = await agents.resumeExistingSession(sessionId, workspace.path)
    await workspace.attachSession(sessionId)
    const humanId = MessageId(`member-question-human:${input.rpcId}`)
    if (!hasMessage(agent.session, humanId)) {
      const message = freezeMessage({
        id: humanId,
        role: 'user' as const,
        content: admissionContent(input.content),
        source: { kind: 'user' as const, rpcId: input.rpcId as unknown as SessionRequestId },
      })
      if (input.mode === 'steer') agent.steer(message)
      else agent.followup(message)
    }
    if (disposed) throw new Error('member-question human admission is disposed')
    await ctx.sessions.flush(agent.session)
    return { accepted: true as const }
  }

  const unregisterMaterializer = receiver.registerSessionMaterializer(materializer)
  const unregisterAdmitter = receiver.registerHumanTurnAdmitter(admitter)
  const disposeChanges = receiver.changes((snapshot) => {
    for (const view of snapshot.terminal) {
      void scheduleTerminalSync(view).catch((error: unknown) => {
        ctx.logger.error(`member-question terminal Session sync failed: ${String(error)}`)
        queueTerminalRetry(view)
      })
    }
  })
  const recover = async (): Promise<void> => {
    try {
      await receiver.resumeReservedSessionMaterializations()
      await receiver.resumeReservedHumanTurns()
      const snapshot = await receiver.snapshot()
      for (const view of snapshot.terminal) await scheduleTerminalSync(view)
    } catch (error: unknown) {
      if (disposed) return
      ctx.logger.error(`member-question Host recovery failed: ${String(error)}`)
      recoveryHandle = timer.set(() => {
        recoveryHandle = undefined
        void track(recover())
      }, retryMs)
    }
  }
  void track(recover())
  return async () => {
    disposed = true
    unregisterMaterializer()
    unregisterAdmitter()
    disposeChanges()
    if (retryHandle !== undefined) timer.clear(retryHandle)
    if (recoveryHandle !== undefined) timer.clear(recoveryHandle)
    terminalRetryPending.clear()
    await Promise.allSettled([...ownedTasks])
  }
}
