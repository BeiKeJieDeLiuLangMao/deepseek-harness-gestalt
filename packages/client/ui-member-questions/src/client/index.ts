/**
 * Member-question plugin, browser half: the MemberQuestionDock registered on
 * conversation.input.dock. It reads Host pending views from ReceivingQuestionBook
 * and declares question.presentation for the shared Ask User occupant. This
 * package does not import PendingQuestion.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ReceivingQuestionBook } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { BetterSidebarService } from '@deepseek-ai/dsh-client-ui-better-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import type { MemberQuestionDockInjected, MemberQuestionReferenceView } from './contract/slots.ts'
import { MemberQuestionDock } from './MemberQuestionCard.tsx'
import { en, zh, type MemberQuestionKey } from './locales.ts'

export {
  selectMemberQuestion, selectMemberQuestionRecords,
  memberBriefOf, presentationQuestionsOf, clampBackground, BACKGROUND_CLAMP,
} from './contract/slots.ts'
export type {
  MemberQuestionBrief, MemberQuestionComposerProps, MemberQuestionOrigin,
  MemberQuestionReferenceChip, MemberQuestionReferenceView, MemberQuestionRole, MemberQuestionWait,
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

type SidebarSnapshot = ReturnType<BetterSidebarService['getSnapshot']>
type SidebarNode = NonNullable<SidebarSnapshot['state']>['splits']

/** Collect the active editor path from every visible pane in one split tree. */
function activeEditorPaths(node: SidebarNode, paths: string[]): void {
  if (node.kind === 'split') {
    for (const child of node.children) activeEditorPaths(child, paths)
    return
  }
  const tab = node.tabs.find(candidate => candidate.id === node.active)
  if (tab?.type === 'editor' && tab.path !== undefined) paths.push(tab.path)
}

/** Project only visible Files viewers while the editor descriptor owns their tabs. */
function projectReferenceView(
  snapshot: SidebarSnapshot | undefined,
  editorAvailable: boolean,
): MemberQuestionReferenceView {
  const state = snapshot?.state
  if (snapshot?.sessionId === undefined || state === undefined || !editorAvailable) return { paths: [] }
  const paths: string[] = []
  if (state.panelOpen) activeEditorPaths(state.splits, paths)
  if (state.bottomOpen) activeEditorPaths(state.bottomSplits, paths)
  for (const floating of state.floats) {
    if (floating.tab.type === 'editor' && floating.tab.path !== undefined) paths.push(floating.tab.path)
  }
  return { sessionId: SessionId(snapshot.sessionId), paths }
}

/** Optional Better Sidebar state as one stable renderer source, including late provider changes. */
function referenceViewSource(ctx: ClientContext): HostObservable<MemberQuestionReferenceView> {
  let previousService: BetterSidebarService | undefined
  let previousSnapshot: SidebarSnapshot | undefined
  let previousEditorAvailable = false
  let previousView: MemberQuestionReferenceView = { paths: [] }
  return {
    getSnapshot: () => {
      const service = ctx.get('betterSidebar')
      const snapshot = service?.getSnapshot()
      const editorAvailable = service?.getTab('editor') !== undefined
      if (
        service === previousService
        && snapshot === previousSnapshot
        && editorAvailable === previousEditorAvailable
      ) return previousView
      previousService = service
      previousSnapshot = snapshot
      previousEditorAvailable = editorAvailable
      previousView = projectReferenceView(snapshot, editorAvailable)
      return previousView
    },
    subscribe: (listener) => {
      let releaseState: (() => void) | undefined
      let releaseRegistry: (() => void) | undefined
      const bind = (): void => {
        releaseState?.()
        releaseRegistry?.()
        const service = ctx.get('betterSidebar')
        releaseState = service?.subscribeState(listener)
        releaseRegistry = service?.subscribe(listener)
      }
      bind()
      const releaseService = ctx.on('internal/service', (name: string) => {
        if (name !== 'betterSidebar') return
        bind()
        listener()
      })
      return () => {
        releaseService()
        releaseState?.()
        releaseRegistry?.()
      }
    },
  }
}

/**
 * Client plugin body: register the `member-question` dictionaries and the
 * composite card into the composer chain at a priority ahead of the shared
 * question composer (default 0), so a member-question request elects this
 * wrapper and every other request falls through to the shared entries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-member-questions: dictionaries')

  const referencePath = (sessionId: SessionId, path: string): string => {
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    return resolveWorkspacePath(cwd, path)
  }
  const openReference = (sessionId: SessionId, path: string, title?: string): void => {
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    const absolute = referencePath(sessionId, path)
    const sidebar = ctx.get('betterSidebar')
    if (sidebar?.getTab('editor') !== undefined) {
      sidebar.openFile(cwd === undefined ? { sessionId } : { sessionId, cwd }, absolute, title)
      return
    }
    void ctx.remote.session.openWorkspacePath({ path: absolute })
  }
  const referenceView = referenceViewSource(ctx)

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
        referencePath,
        settle: (sessionId, answers) => ctx.receivingQuestions.settle(sessionId, answers),
        decline: sessionId => ctx.receivingQuestions.decline(sessionId),
        hooks: { receivingQuestions: ctx.receivingQuestions, referenceView },
      }),
    },
    MemberQuestionDock,
  ))
}
