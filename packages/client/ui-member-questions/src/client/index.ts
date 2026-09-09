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
import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { fileAddressFor, parseFileAddress, resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
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

type SidebarSnapshot = ReturnType<ISidebarRight['getSnapshot']>
type SidebarRegistry = ClientContext['sidebarRightTabs']

/** Visible registered file occurrences in the mounted workbench Session. */
function projectReferenceView(
  snapshot: SidebarSnapshot | undefined,
  registry: SidebarRegistry | undefined,
  cwd: string | undefined,
): MemberQuestionReferenceView {
  const sessionId = snapshot?.mountedSessionId
  const session = snapshot?.sessions.find(entry => entry.sessionId === sessionId)
  if (sessionId === undefined || session === undefined || registry === undefined) return { paths: [] }
  const paths: string[] = []
  for (const tab of session.tabs) {
    if (!tab.visible || registry.get(tab.record.kind) === undefined) continue
    const file = parseFileAddress(tab.record.contentId)
    if (file === undefined || (file.scope === 'session' && file.sessionId !== sessionId)) continue
    const path = file.scope === 'absolute' ? file.path : resolveWorkspacePath(cwd, file.path)
    if (registry.matchViewer({ address: tab.record.contentId, path }) === undefined) continue
    paths.push(path)
  }
  return { sessionId, paths }
}

/** Official workbench projection with late service and viewer registration changes. */
function referenceViewSource(ctx: ClientContext): HostObservable<MemberQuestionReferenceView> {
  let previousService: ISidebarRight | undefined
  let previousSnapshot: SidebarSnapshot | undefined
  let previousRegistry: SidebarRegistry | undefined
  let previousEntries: ReturnType<SidebarRegistry['entries']> | undefined
  let previousViewers: ReturnType<SidebarRegistry['viewers']> | undefined
  let previousCwd: string | undefined
  let previousView: MemberQuestionReferenceView = { paths: [] }
  return {
    getSnapshot: () => {
      const service = ctx.get('sidebarRight')
      const snapshot = service?.getSnapshot()
      const registry = ctx.get('sidebarRightTabs')
      const entries = registry?.entries()
      const viewers = registry?.viewers()
      const sessionId = snapshot?.mountedSessionId
      const cwd = sessionId === undefined ? undefined : ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
      if (service === previousService && snapshot === previousSnapshot
        && registry === previousRegistry && entries === previousEntries
        && viewers === previousViewers && cwd === previousCwd) return previousView
      previousService = service
      previousSnapshot = snapshot
      previousRegistry = registry
      previousEntries = entries
      previousViewers = viewers
      previousCwd = cwd
      previousView = projectReferenceView(snapshot, registry, cwd)
      return previousView
    },
    subscribe: (listener) => {
      let releaseState: (() => void) | undefined
      let releaseRegistry: (() => void) | undefined
      const bind = (): void => {
        releaseState?.()
        releaseRegistry?.()
        releaseState = ctx.get('sidebarRight')?.subscribe(listener)
        releaseRegistry = ctx.get('sidebarRightTabs')?.subscribe(listener)
      }
      bind()
      const releaseSessions = ctx.sessions.list.subscribe(listener)
      const releaseService = ctx.on('internal/service', (name: string) => {
        if (name !== 'sidebarRight' && name !== 'sidebarRightTabs') return
        bind()
        listener()
      })
      return () => {
        releaseService()
        releaseSessions()
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
  const openReference = async (sessionId: SessionId, path: string, title?: string): Promise<void> => {
    const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    const absolute = referencePath(sessionId, path)
    const sidebar = ctx.get('sidebarRight')
    const address = fileAddressFor(sessionId, cwd, absolute)
    if (sidebar !== undefined && (ctx.get('sidebarRightTabs')?.candidates(address).length ?? 0) > 0) {
      const navigator = sidebar.forSession(sessionId)
      const tabId = await navigator.openResource(address)
      if (title !== undefined) navigator.update(tabId, { title })
      return
    }
    const result = await ctx.remote.session.openWorkspacePath({ path: absolute })
    if (!result.ok) throw new Error(result.error.message)
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
