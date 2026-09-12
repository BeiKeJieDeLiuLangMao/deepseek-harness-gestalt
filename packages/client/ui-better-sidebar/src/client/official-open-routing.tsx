/** Route model, chat, and Host file opens through official Sidebar owners. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { IconCodeOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarContext } from '../context-types.ts'
import { t } from './locales.ts'
import { wrapOpenWorkspacePath, type OpenWorkspacePathService } from './openpath-intercept.ts'
import { officialFileAddress } from './official-files/address.ts'
import { OFFICIAL_FILE_ID, OFFICIAL_FILE_KIND } from './official-files/definitions.ts'
import { resolveSidebarPath, selectProducedFiles } from './produced-files.ts'
import css from './sidebar.module.css'

/** Services needed by official open routing and the Host delivery feed. */
export const OFFICIAL_OPEN_ROUTING_INJECT = [
  'slots',
  'sidebarRight',
  'sidebarRightTabs',
  'sidebarRightPreferences',
  'sessions',
] as const

/** Client context required by the official open adapters. */
export type OfficialOpenRoutingContext = SidebarContext & Pick<
  ClientContext,
  'sidebarRight' | 'sidebarRightTabs' | 'sidebarRightPreferences'
>

/** Browser owner supplied after its official definition registers. */
export interface OfficialOpenRoutingOptions {
  readonly openUrl: (
    sessionId: SessionId,
    url: string,
    title: string | undefined,
  ) => Promise<void> | void
}

type AgentOpenRequest = {
  readonly kind: 'file' | 'folder' | 'url'
  readonly target: string
  readonly title?: string
}

function fileTitle(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return path.slice(at + 1) || path
}

function sessionCwd(ctx: OfficialOpenRoutingContext, sessionId: SessionId): string | undefined {
  return ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
}

/** Open one file resource in its initiating Session. */
export async function openOfficialFile(
  ctx: OfficialOpenRoutingContext,
  sessionId: SessionId,
  path: string,
  title?: string,
  displayHostSessionId: SessionId = sessionId,
): Promise<void> {
  const cwd = sessionCwd(ctx, sessionId)
  const absolute = resolveSidebarPath(cwd, path)
  const navigator = ctx.sidebarRight.forSession(displayHostSessionId)
  const tabId = await navigator.openResource(officialFileAddress(sessionId, cwd, absolute))
  if (title !== undefined && title !== '') navigator.update(tabId, { title })
}

/** Open a full Better tree rooted at one folder in its initiating Session. */
export async function openOfficialFolder(
  ctx: OfficialOpenRoutingContext,
  sessionId: SessionId,
  path: string,
  title?: string,
  displayHostSessionId: SessionId = sessionId,
): Promise<void> {
  const cwd = sessionCwd(ctx, sessionId)
  const absolute = resolveSidebarPath(cwd, path)
  const navigator = ctx.sidebarRight.forSession(displayHostSessionId)
  const tabId = await navigator.openResource<'file'>(officialFileAddress(sessionId, cwd, absolute), {
    kind: OFFICIAL_FILE_KIND,
    payload: { dir: true },
  })
  navigator.update(tabId, { title: title === undefined || title === '' ? fileTitle(absolute) : title })
}

/** Reveal files in the Better tree for one Session without a second layout store. */
export async function revealOfficialFiles(
  ctx: OfficialOpenRoutingContext,
  sessionId: SessionId,
  files: readonly string[],
  displayHostSessionId: SessionId = sessionId,
): Promise<void> {
  const cwd = sessionCwd(ctx, sessionId)
  const targets = files.length === 0
    ? cwd === undefined ? [] : [cwd]
    : files.map(path => resolveSidebarPath(cwd, path))
  const root = cwd ?? ''
  const navigator = ctx.sidebarRight.forSession(displayHostSessionId)
  const tabId = await navigator.openResource<'file'>(officialFileAddress(sessionId, cwd, root), {
    kind: OFFICIAL_FILE_KIND,
    params: { reveal: targets },
    payload: { dir: true },
  })
  navigator.update(tabId, { title: t('files') })
}

/** The official turn-tail row retains the existing product copy and gestures. */
export function OfficialProducedFiles(props: {
  readonly matched: readonly string[]
  readonly displayHostSessionId?: SessionId
  readonly openInSidebar: (path: string, displayHostSessionId?: SessionId) => void
  readonly onShowInFolder: (files: readonly string[], displayHostSessionId?: SessionId) => void
}) {
  const shown = props.matched.slice(0, 6)
  const hidden = props.matched.length - shown.length
  return (
    <div className={css.producedRow}>
      <span className={css.producedLabel}>{t('produced')}</span>
      {shown.map((path) => (
        <button
          key={path}
          type="button"
          className={css.producedChip}
          title={path}
          onClick={() => {
            if (props.displayHostSessionId === undefined) props.openInSidebar(path)
            else props.openInSidebar(path, props.displayHostSessionId)
          }}
        >
          <IconCodeOutline16 size={12} />
          <span>{fileTitle(path)}</span>
        </button>
      ))}
      {hidden > 0 && <span className={css.producedMore}>+{hidden}</span>}
      {hidden > 0 && (
        <button
          type="button"
          className={css.producedFolder}
          onClick={() => {
            if (props.displayHostSessionId === undefined) props.onShowInFolder(props.matched)
            else props.onShowInFolder(props.matched, props.displayHostSessionId)
          }}
        >
          {t('showInFolder')}
        </button>
      )}
    </div>
  )
}

function reportOpenFailure(subject: string, error: unknown): void {
  console.error(`[dsh-better-sidebar] ${subject} failed:`, error)
}

/**
 * Check whether the closing turn declared explicit deliverables.
 *
 * When presented files exist, the official Deliverables component must own the
 * turn tail so it renders both the presented cards and produced files.
 */
export function hasPresentedDeliverables(owner: unknown): boolean {
  const record = owner as {
    turn?: { data?: { get?: (key: string) => unknown } }
    seq?: unknown
  } | null
  if (record === null || typeof record !== 'object') return false
  const seq = typeof record.seq === 'number' ? record.seq : Number.POSITIVE_INFINITY
  const data = record.turn?.data?.get?.('deliverables') as
    | { presented?: unknown }
    | null
    | undefined
  if (data !== null && typeof data === 'object' && Array.isArray(data.presented)) {
    return data.presented.some((item) => {
      if (item === null || typeof item !== 'object') return false
      const file = item as { seq?: unknown }
      return typeof file.seq !== 'number' || file.seq < seq
    })
  }
  return false
}

/** Register the official produced-file row through the conversation chain. */
export function registerOfficialTurnTail(ctx: OfficialOpenRoutingContext): () => void {
  return ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    select: (owner) => {
      const preferences = ctx.sidebarRightPreferences.getSnapshot().preferences
      if (!preferences.interceptOpenPath || !ctx.sidebarRightTabs.isTabEnabled(OFFICIAL_FILE_ID)) return null
      if (hasPresentedDeliverables(owner)) return null
      return selectProducedFiles(owner)
    },
    priority: -1,
    registrant: 'dsh-better-sidebar',
    inject: (sessionId: string) => ({
      openInSidebar: (path: string, displayHostSessionId?: SessionId) => {
        void openOfficialFile(ctx, SessionId(sessionId), path, undefined, displayHostSessionId)
          .catch(error => { reportOpenFailure('open file', error) })
      },
      onShowInFolder: (files: readonly string[], displayHostSessionId?: SessionId) => {
        void revealOfficialFiles(ctx, SessionId(sessionId), files, displayHostSessionId)
          .catch(error => { reportOpenFailure('reveal files', error) })
      },
    }),
  }, OfficialProducedFiles))
}

/** Replace the Host system-open funnel with the official file occurrence. */
export function registerOfficialOpenPath(ctx: OfficialOpenRoutingContext): () => void {
  const fiber = ctx.inject(['remote.session'], (injected) => {
    injected.effect(() => {
      const service = injected.get('remote.session') as OpenWorkspacePathService
      return wrapOpenWorkspacePath(service, {
        takeoverEnabled: () => {
          const preferences = ctx.sidebarRightPreferences.getSnapshot().preferences
          return preferences.interceptOpenPath && ctx.sidebarRightTabs.isTabEnabled(OFFICIAL_FILE_ID)
        },
        currentSessionId: () => ctx.sessions.list.getSnapshot().current,
        openInSidebar: (path, sessionId) => {
          void openOfficialFile(ctx, SessionId(sessionId), path).catch(error => { reportOpenFailure('open path', error) })
        },
        revealInExplorer: (_path, sessionId) => {
          void revealOfficialFiles(ctx, SessionId(sessionId), []).catch(error => { reportOpenFailure('reveal workspace', error) })
        },
      })
    }, 'dsh-better-sidebar: official open-path wrapper')
  })
  return () => { void fiber.dispose() }
}

/** Narrow one Host `sidebar_open` message at the WebSocket boundary. */
export function agentOpenRequestOf(value: unknown): AgentOpenRequest | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const request = value as { kind?: unknown; target?: unknown; title?: unknown }
  if (request.kind !== 'file' && request.kind !== 'folder' && request.kind !== 'url') return undefined
  if (typeof request.target !== 'string' || request.target === '') return undefined
  const title = request.title
  if (title !== undefined && typeof title !== 'string') return undefined
  const accepted: AgentOpenRequest = {
    kind: request.kind,
    target: request.target,
  }
  return typeof title === 'string' && title !== '' ? { ...accepted, title } : accepted
}

/** Deliver one accepted Host request through its Session-bound official navigator. */
export async function routeOfficialAgentOpen(
  ctx: OfficialOpenRoutingContext,
  options: OfficialOpenRoutingOptions,
  sessionId: SessionId,
  request: AgentOpenRequest,
): Promise<void> {
  if (request.kind === 'file') {
    await openOfficialFile(ctx, sessionId, request.target, request.title)
  } else if (request.kind === 'folder') {
    await openOfficialFolder(ctx, sessionId, request.target, request.title)
  } else {
    await options.openUrl(sessionId, request.target, request.title)
  }
}

const AGENT_OPEN_FAILURE_LIMIT = 3

/** Follow the current Session's queued `sidebar_open` deliveries outside React. */
export function subscribeOfficialAgentOpens(
  ctx: OfficialOpenRoutingContext,
  options: OfficialOpenRoutingOptions,
): () => void {
  let socket: WebSocket | undefined
  let retry: number | undefined
  let current: SessionId | undefined
  let generation = 0
  let failures = 0
  let disposed = false
  let deliveryTail = Promise.resolve()

  const disconnect = (): void => {
    generation += 1
    window.clearTimeout(retry)
    retry = undefined
    const previous = socket
    socket = undefined
    previous?.close()
  }
  const connect = (sessionId: SessionId): void => {
    if (disposed || current !== sessionId) return
    const ownGeneration = generation
    const url = new URL('/sidebar/ws/agent-opens', location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.search = new URLSearchParams({ sessionId }).toString()
    const next = new WebSocket(url.toString())
    socket = next
    next.onopen = () => {
      if (ownGeneration === generation) failures = 0
    }
    next.onmessage = (event) => {
      if (typeof event.data !== 'string' || ownGeneration !== generation) return
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      const request = agentOpenRequestOf(parsed)
      if (request === undefined || !ctx.sidebarRightPreferences.getSnapshot().preferences.agentOpenTools) return
      deliveryTail = deliveryTail
        .then(() => routeOfficialAgentOpen(ctx, options, sessionId, request))
        .catch(error => { reportOpenFailure('sidebar_open delivery', error) })
    }
    next.onerror = () => { next.close() }
    next.onclose = () => {
      if (disposed || ownGeneration !== generation) return
      failures += 1
      if (failures >= AGENT_OPEN_FAILURE_LIMIT) {
        console.error('[dsh-better-sidebar] agent-opens connection failed; stopping reconnect loop', sessionId)
        return
      }
      retry = window.setTimeout(() => { connect(sessionId) }, 2000)
    }
  }
  const selectSession = (): void => {
    const sessionId = ctx.sessions.list.getSnapshot().current
    if (sessionId === current) return
    disconnect()
    current = sessionId
    failures = 0
    if (sessionId !== undefined) connect(sessionId)
  }
  const unsubscribe = ctx.sessions.list.subscribe(selectSession)
  selectSession()
  return () => {
    disposed = true
    unsubscribe()
    disconnect()
  }
}

/** Register every non-link official open adapter for one plugin lifetime. */
export function registerOfficialOpenRouting(
  ctx: OfficialOpenRoutingContext,
  options: OfficialOpenRoutingOptions,
): () => void {
  const disposers = [
    registerOfficialTurnTail(ctx),
    registerOfficialOpenPath(ctx),
    subscribeOfficialAgentOpens(ctx, options),
  ]
  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]?.()
  }
}
