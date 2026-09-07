/**
 * Member-question plugin, browser half: the MemberQuestionDock registered on
 * conversation.input.dock. It reads Host pending views from ReceivingQuestionBook
 * and declares question.presentation for the shared Ask User occupant. This
 * package does not import PendingQuestion.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ReceivingQuestionBook } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-better-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import type { MemberQuestionDockInjected } from './contract/slots.ts'
import { MemberQuestionDock } from './MemberQuestionCard.tsx'
import { en, zh, type MemberQuestionKey } from './locales.ts'

export {
  selectMemberQuestion, selectMemberQuestionRecords,
  memberBriefOf, presentationQuestionsOf, clampBackground, BACKGROUND_CLAMP,
} from './contract/slots.ts'
export type {
  MemberQuestionBrief, MemberQuestionComposerProps, MemberQuestionOrigin,
  MemberQuestionReferenceChip, MemberQuestionRole, MemberQuestionWait,
} from './contract/slots.ts'
export type { MemberQuestionKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The member-question brief's copy. */
    'member-question': MemberQuestionKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-owned member-question receiving projection. */
    receivingQuestions: ReceivingQuestionBook
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'member-question'

/** Required services: slots, dictionaries, Sessions, Host Remote, and receiving projection. */
export const inject = ['slots', 'locale', 'sessions', 'receivingQuestions', 'remote', 'remote.session']

/**
 * Client plugin body: register the `member-question` dictionaries and the
 * composite card into the composer chain at a priority ahead of the shared
 * question composer (default 0), so a member-question request elects this
 * wrapper and every other request falls through to the shared entries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-member-questions: dictionaries')

  const openReference = (sessionId: SessionId, path: string, title?: string): void => {
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    const absolute = resolveWorkspacePath(cwd, path)
    const sidebar = ctx.get('betterSidebar')
    if (sidebar?.getTab('editor') !== undefined) {
      sidebar.openFile(cwd === undefined ? { sessionId } : { sessionId, cwd }, absolute, title)
      return
    }
    void ctx.remote.session.openWorkspacePath({ path: absolute })
  }

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
    {
      name: 'conversation.input.dock',
      id: 'member-question',
      order: -20,
      locale: NS,
      children: {
        'question.presentation': { kind: 'single', scope: 'session' },
      },
      inject: (): MemberQuestionDockInjected => ({
        openReference,
        settle: (sessionId, answers) => ctx.receivingQuestions.settle(sessionId, answers),
        decline: sessionId => ctx.receivingQuestions.decline(sessionId),
        hooks: { receivingQuestions: ctx.receivingQuestions },
      }),
    },
    MemberQuestionDock,
  ))
}
