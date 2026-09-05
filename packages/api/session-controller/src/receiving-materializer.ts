/** Host Session materialization for authenticated member-question arrivals. */

import type { Context } from '@deepseek-ai/cordis'
import { freezeMessage } from '@deepseek-ai/dsh-llm'
import { MessageId } from '@deepseek-ai/dsh-llm/brand'
import {
  writeMemberQuestionDocumentCache,
  type MemberQuestionHumanTurnAdmissionContext,
  type MemberQuestionSessionMaterializer,
} from '@deepseek-ai/dsh-member-question-receiver'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SessionAlreadyExistsError } from '@deepseek-ai/dsh-session-persistence'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { ApiSessionAgentController } from './agent.ts'

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
 * Register the single Host arrival materializer on the member-question receiver.
 * Creates or continues the receiver-owned Session identity, attaches the bound
 * Workspace, records ignorable `member-question/received` metadata, and injects
 * the Decision Brief without starting a model turn. Unregistering the effect
 * withdraws the materializer.
 * @param ctx - Host context with sessions, agents, and workspace registry.
 * @param agents - Session Controller Agent activation.
 * @returns disposer for this exact registration, or undefined when the receiver is uncomposed.
 */
export function installReceivingSessionMaterializer(
  ctx: Context,
  agents: ApiSessionAgentController,
): (() => void) | undefined {
  const receiver = ctx.get('memberQuestionReceiver')
  if (receiver === undefined) return undefined
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
  return receiver.registerSessionMaterializer(materializer)
}
