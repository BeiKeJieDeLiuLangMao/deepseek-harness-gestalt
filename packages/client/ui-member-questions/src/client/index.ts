/**
 * Member-question plugin, browser half: the MemberQuestionCard registered as a
 * selector-routed entry of the conversation-declared composer chain, ahead of
 * the shared question composer, plus the `member-question` dictionaries. The
 * selector claims only requests whose whole batch declares the
 * `member-question` intent; `plan-review` and generic requests keep electing
 * the shared composer unchanged. The presentation and answer protocol stay
 * owned by dsh-client-ui-user-questions — this package mounts the sanctioned
 * presentation seam under its Decision Brief banner and binds the `question`
 * dictionary through the standard locale seat for it.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { DetailsDocumentFocus } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ReceivingQuestionBook } from '@deepseek-ai/dsh-api-session-controller/src/client/sessions/receiving.ts'
import { MemberQuestionDock } from './MemberQuestionCard.tsx'
import { en, zh, type MemberQuestionKey } from './locales.ts'

export { selectMemberQuestion, selectMemberQuestionRecords, isMemberQuestionBatch, memberBriefOf, clampBackground, BACKGROUND_CLAMP } from './contract/slots.ts'
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

/** Required services: slots, dictionaries, Files-open path, and receiving projection. */
export const inject = ['slots', 'locale', 'workspaces', 'sessions', 'receivingQuestions']

/**
 * Client plugin body: register the `member-question` dictionaries and the
 * composite card into the composer chain at a priority ahead of the shared
 * question composer (default 0), so a member-question request elects this
 * wrapper and every other request falls through to the shared entries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-member-questions: dictionaries')

  // The mounted presentation reads the `question` namespace (owned by
  // dsh-client-ui-user-questions); bind is stable per namespace, so the
  // injected translator never churns memo identity.
  const questionT = ctx.locale.bind('question')

  // Resolve the optional provider at gesture time: dynamic client rows may
  // supply or release ui-conversation after this fiber has registered.
  const focusDocument = (sessionId: SessionId, document: DetailsDocumentFocus): void => {
    ctx.get('detailsFocus')?.focus(sessionId, document)
  }

  const openReference = (sessionId: SessionId, path: string, title?: string): void => {
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    const absolute = cwd === undefined || cwd === '' || path.startsWith('/')
      ? path
      : `${cwd.replace(/[/\\]+$/, '')}/${path.replace(/^[/\\]+/, '')}`
    const sidebar = ctx.get('betterSidebar') as {
      getTab(id: string): unknown
      openFile(scope: { sessionId: string; cwd?: string }, path: string, title?: string): void
    } | undefined
    if (sidebar?.getTab('editor') !== undefined) {
      sidebar.openFile(cwd === undefined ? { sessionId } : { sessionId, cwd }, absolute, title)
      return
    }
    void ctx.workspaces.openPath(absolute)
  }

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
    {
      name: 'conversation.input.dock',
      id: 'member-question',
      order: -20,
      locale: NS,
      inject: () => ({
        questionT,
        focusDocument,
        openReference,
        hooks: { receivingQuestions: ctx.receivingQuestions },
      }),
    },
    MemberQuestionDock,
  ))
}
