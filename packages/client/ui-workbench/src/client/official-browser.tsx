/** Browser Workspace implementation of the official Browser tab kind. */
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BrowserPageState, BrowserTarget, BrowserWorkspaceProjection,
  BrowserWorkspaceCreateRemoteRequest,
} from '@deepseek-ai/dsh-browser-workspace/client'
import { listBrowserWorkspacePages } from '@deepseek-ai/dsh-browser-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-browser/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {
  SidebarRightProjection, SidebarRightTabCloseContext, SidebarRightTabDefinition,
  SidebarRightTabProjection, TabId,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { OfficialBrowserPayload } from '@deepseek-ai/dsh-client-ui-better-sidebar/src/official-browser.ts'
import { bindBrowserWorkspace, type BrowserWorkspaceRemoteFace } from './remote-bind.ts'

export const OFFICIAL_BROWSER_KIND = 'browser'

export function officialBrowserTargetKey(target: BrowserTarget): string {
  return `${target.profileId}/${target.workspaceId}/${target.browserId}/${target.tabId}`
}

export function officialBrowserPayloadOf(value: unknown): OfficialBrowserPayload | undefined {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const payload = value as OfficialBrowserPayload
  if (payload.target !== undefined) {
    const target = payload.target
    if (typeof target.profileId !== 'string' || target.profileId === ''
      || typeof target.workspaceId !== 'string' || target.workspaceId === ''
      || typeof target.browserId !== 'string' || target.browserId === ''
      || typeof target.tabId !== 'string' || target.tabId === '') return undefined
  }
  return payload
}

export function officialBrowserTargetOf(value: unknown): BrowserTarget | undefined {
  return officialBrowserPayloadOf(value)?.target as BrowserTarget | undefined
}

function browserCreateRequest(
  profile: OfficialBrowserPayload['profile'],
  fallback: () => BrowserWorkspaceCreateRemoteRequest,
): BrowserWorkspaceCreateRemoteRequest {
  if (profile === undefined) return fallback()
  if (profile.kind === 'persistent') return { profile: 'persistent', name: profile.name }
  return { profile: profile.kind }
}

function browserSettings(copy: (key: string) => string) {
  return [{
    key: 'browserNoSandbox', source: 'preference' as const,
    title: () => copy('settingsBrowserSandboxTitle'), unsafe: true,
  }, {
    key: 'browserInterceptLinks', source: 'preference' as const,
    title: () => copy('settingsBrowserLinksTitle'),
  }, {
    key: 'browserInterceptHttp', source: 'preference' as const,
    title: () => copy('settingsBrowserHttpTitle'),
  }, {
    key: 'browserInterceptHttps', source: 'preference' as const,
    title: () => copy('settingsBrowserHttpsTitle'),
  }, {
    key: 'browserAllowedLoopback', source: 'preference' as const, control: 'text' as const,
    title: () => copy('settingsBrowserLoopbackTitle'),
    placeholder: copy('settingsBrowserLoopbackPlaceholder'),
  }]
}

/** Stable definition id that takes over the iframe fallback while Workbench is mounted. */
export const OFFICIAL_WORKBENCH_BROWSER_ID = '@deepseek-ai/dsh-client-ui-workbench/browser'

interface SessionListRow {
  projectionValues?: { browserWorkspace?: BrowserWorkspaceProjection }
}

interface SessionListSnapshot {
  readonly current?: SessionId
  readonly byId: Readonly<Record<string, SessionListRow | undefined>>
}

interface SessionListFace {
  getSnapshot(): SessionListSnapshot
  subscribe(listener: () => void): () => void
}

/** Services required by the Browser occurrence owner and body. */
export type OfficialWorkbenchBrowserContext = ClientContext

function sessionList(ctx: OfficialWorkbenchBrowserContext): SessionListFace {
  return ctx.sessions.list as SessionListFace
}

function workspaceProjection(ctx: OfficialWorkbenchBrowserContext, sessionId: SessionId): BrowserWorkspaceProjection | undefined {
  return sessionList(ctx).getSnapshot().byId[sessionId]?.projectionValues?.browserWorkspace
}

function remoteFace(ctx: OfficialWorkbenchBrowserContext): BrowserWorkspaceRemoteFace {
  return (ctx.remote as unknown as { browserWorkspace: BrowserWorkspaceRemoteFace }).browserWorkspace
}

function browserTabs(projection: SidebarRightProjection): SidebarRightTabProjection[] {
  return projection.sessions.flatMap(session => session.tabs)
    .filter(tab => tab.record.kind === OFFICIAL_BROWSER_KIND)
}

function pageOf(ctx: OfficialWorkbenchBrowserContext, sessionId: SessionId, target: BrowserTarget) {
  return listBrowserWorkspacePages(workspaceProjection(ctx, sessionId))
    .find(page => officialBrowserTargetKey(page.target) === officialBrowserTargetKey(target))
}

function profileOf(page: BrowserPageState): OfficialBrowserPayload['profile'] {
  if (page.chrome.kind === 'temporary' || page.chrome.kind === 'shared') return { kind: page.chrome.kind }
  return page.chrome.name === undefined ? undefined : { kind: 'persistent', name: page.chrome.name }
}

function pagePayload(page: BrowserPageState): OfficialBrowserPayload {
  const profile = profileOf(page)
  return {
    target: { ...page.target },
    ...(profile === undefined ? {} : { profile }),
    ...(page.url === '' || page.url === 'about:blank' ? {} : { url: page.url }),
  }
}

/** Occurrence owner that keeps Browser pages alive across React remounts. */
export class OfficialBrowserRuntime {
  private readonly pending = new Map<string, Promise<BrowserPageState | undefined>>()
  private readonly closing = new Set<string>()
  private disposed = false

  constructor(private readonly ctx: OfficialWorkbenchBrowserContext) {}

  subscribe(): () => void {
    const sync = (): void => { this.sync() }
    const disposers = [this.ctx.sidebarRight.subscribe(sync), sessionList(this.ctx).subscribe(sync)]
    this.sync()
    return () => {
      this.disposed = true
      for (const dispose of disposers) dispose()
    }
  }

  private sync(): void {
    if (this.disposed) return
    const projection = this.ctx.sidebarRight.getSnapshot()
    const tabs = browserTabs(projection)
    const sessionIds = new Set<SessionId>(tabs.map(tab => tab.sessionId))
    const current = sessionList(this.ctx).getSnapshot().current
    if (current !== undefined) sessionIds.add(current)
    for (const sessionId of sessionIds) {
      const sessionTabs = tabs.filter(tab => tab.sessionId === sessionId)
      const claimed = new Set(sessionTabs.flatMap((tab) => {
        const target = officialBrowserTargetOf(tab.state.payload)
        return target === undefined ? [] : [officialBrowserTargetKey(target)]
      }))
      for (const tab of sessionTabs) {
        const payload = officialBrowserPayloadOf(tab.state.payload)
        if (payload !== undefined && payload.target === undefined && payload.createError === undefined) {
          this.ensure(sessionId, tab.record.id)
        }
      }
      for (const page of listBrowserWorkspacePages(workspaceProjection(this.ctx, sessionId))) {
        const key = officialBrowserTargetKey(page.target)
        if (claimed.has(key) || this.closing.has(key)) continue
        void this.ctx.sidebarRight.forSession(sessionId).openTab(OFFICIAL_BROWSER_KIND, {
          instanceId: key,
          title: page.url ?? 'Browser',
          payload: {
            target: { ...page.target },
            ...(page.url === undefined ? {} : { url: page.url }),
          },
          activate: false,
        }).catch((error: unknown) => {
          console.error('[ui-workbench] restoring Browser occurrence failed:', error)
        })
      }
    }
    const liveKeys = new Set([...sessionIds].flatMap(sessionId =>
      listBrowserWorkspacePages(workspaceProjection(this.ctx, sessionId)).map(page => officialBrowserTargetKey(page.target))))
    for (const key of this.closing) {
      if (!liveKeys.has(key)) this.closing.delete(key)
    }
  }

  ensure(sessionId: SessionId, tabId: string): void {
    const key = `${sessionId}\u0000${tabId}`
    if (this.disposed || this.pending.has(key)) return
    const operation = this.create(sessionId, tabId).finally(() => { this.pending.delete(key) })
    this.pending.set(key, operation)
  }

  retry(sessionId: SessionId, tabId: string): void {
    const tab = browserTabs(this.ctx.sidebarRight.getSnapshot())
      .find(candidate => candidate.sessionId === sessionId && candidate.record.id === tabId)
    const payload = officialBrowserPayloadOf(tab?.state.payload)
    if (payload === undefined || payload.target !== undefined) return
    const { createError: _createError, ...next } = payload
    this.ctx.sidebarRight.forSession(sessionId).update(tabId as TabId, { payload: next })
    this.ensure(sessionId, tabId)
  }

  recover(sessionId: SessionId, tabId: string, missing: BrowserTarget): Promise<BrowserPageState | undefined> {
    const tab = browserTabs(this.ctx.sidebarRight.getSnapshot())
      .find(candidate => candidate.sessionId === sessionId && candidate.record.id === tabId)
    const payload = officialBrowserPayloadOf(tab?.state.payload)
    const target = officialBrowserTargetOf(payload)
    if (payload === undefined || target === undefined
      || officialBrowserTargetKey(target) !== officialBrowserTargetKey(missing)) return Promise.resolve(undefined)
    const { target: _target, createError: _createError, ...next } = payload
    this.ctx.sidebarRight.forSession(sessionId).update(tabId as TabId, { payload: next })
    this.ensure(sessionId, tabId)
    return this.pending.get(`${sessionId}\u0000${tabId}`) ?? Promise.resolve(undefined)
  }

  private async create(sessionId: SessionId, tabId: string): Promise<BrowserPageState | undefined> {
    const tab = browserTabs(this.ctx.sidebarRight.getSnapshot())
      .find(candidate => candidate.sessionId === sessionId && candidate.record.id === tabId)
    const payload = officialBrowserPayloadOf(tab?.state.payload)
    if (payload === undefined || payload.target !== undefined || payload.createError !== undefined) return
    const remote = bindBrowserWorkspace(remoteFace(this.ctx), sessionId)
    try {
      const created = await remote.create(browserCreateRequest(payload.profile, this.ctx.browserUi.createRequest))
      const page = payload.url === undefined
        ? created
        : await remote.refresh(created.target, created.revision, payload.url)
      if (this.disposed) return
      const current = browserTabs(this.ctx.sidebarRight.getSnapshot())
        .find(candidate => candidate.sessionId === sessionId && candidate.record.id === tabId)
      const currentPayload = officialBrowserPayloadOf(current?.state.payload)
      if (currentPayload === undefined || currentPayload.target !== undefined) return
      this.ctx.sidebarRight.forSession(sessionId).update(tabId as TabId, {
        payload: pagePayload(page),
        ...(page.title.trim() === '' ? {} : { title: page.title }),
      })
      return page
    } catch (error: unknown) {
      if (this.disposed) return
      const message = error instanceof Error ? error.message : String(error)
      this.ctx.sidebarRight.forSession(sessionId).update(tabId as TabId, {
        payload: { ...payload, createError: message },
      })
      return undefined
    }
  }

  async activate(tab: SidebarRightTabProjection): Promise<void> {
    const target = officialBrowserTargetOf(tab.state.payload)
    const page = target === undefined ? undefined : pageOf(this.ctx, tab.sessionId, target)
    const browserRemote = remoteFace(this.ctx)
    if (target === undefined || page === undefined || browserRemote.focus === undefined) return
    const remote = bindBrowserWorkspace(browserRemote, tab.sessionId)
    await this.ctx.browserUi.recoverListedMutation(remote.focus, remote.observe, target, page.revision)
  }

  async close(close: SidebarRightTabCloseContext): Promise<void> {
    const target = officialBrowserTargetOf(close.payload)
    const page = target === undefined ? undefined : pageOf(this.ctx, close.sessionId, target)
    if (target === undefined || page === undefined) return
    const key = officialBrowserTargetKey(target)
    this.closing.add(key)
    try {
      const remote = bindBrowserWorkspace(
        remoteFace(this.ctx),
        close.sessionId,
      )
      await this.ctx.browserUi.recoverListedMutation(remote.close, remote.observe, target, page.revision)
    } catch (error) {
      this.closing.delete(key)
      throw error
    }
  }
}

interface BrowserBodyInjected {
  readonly ctx: OfficialWorkbenchBrowserContext
  readonly runtime: OfficialBrowserRuntime
}

type BrowserBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & BrowserBodyInjected

/** Render official Browser page chrome for one occurrence. */
export function OfficialWorkbenchBrowserBody({ useTabInfo, ctx, runtime }: BrowserBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const projection = useSyncExternalStore(
    listener => sessionList(ctx).subscribe(listener),
    () => workspaceProjection(ctx, tab.sessionId),
  )
  const payload = officialBrowserPayloadOf(tab.payload) ?? {}
  const target = officialBrowserTargetOf(payload)
  const listedRevision = useMemo(() => target === undefined ? undefined : pageOf(ctx, tab.sessionId, target)?.revision,
    [ctx, projection, tab.sessionId, target])
  const actions = useMemo(() => bindBrowserWorkspace(
    remoteFace(ctx),
    tab.sessionId,
  ), [ctx.remote, tab.sessionId])
  const onCommittedPage = useCallback((page: BrowserPageState): void => {
    tab.actions.update({
      payload: pagePayload(page),
      ...(page.title.trim() === '' ? {} : { title: page.title }),
    })
  }, [tab.actions])
  return ctx.browserUi.renderPageChrome({
    target,
    ...(listedRevision === undefined ? {} : { listedRevision }),
    refresh: actions.refresh,
    observe: actions.observe,
    screenshot: actions.screenshot,
    t: key => ctx.locale.bind('browser')(key as never),
    visible: tab.visible,
    onCommittedPage,
    onMissingTarget: missing => runtime.recover(tab.sessionId, tab.id, missing),
    ...(payload.createError === undefined ? {} : {
      createError: payload.createError,
      onRetry: () => { runtime.retry(tab.sessionId, tab.id) },
    }),
  })
}

/** Build the Browser Workspace definition around its occurrence owner. */
export function workbenchBrowserDefinition(
  ctx: OfficialWorkbenchBrowserContext,
  runtime: OfficialBrowserRuntime,
): SidebarRightTabDefinition {
  const copy = ctx.locale.bind('betterSidebar')
  return {
    id: OFFICIAL_WORKBENCH_BROWSER_ID,
    kind: OFFICIAL_BROWSER_KIND,
    priority: 'extension',
    order: 50,
    icon: 'browser',
    title: () => copy('browser'),
    guide: [{ description: () => copy('browserGuide') }],
    create: (request) => {
      const payload = officialBrowserPayloadOf(request.payload)
      return payload === undefined ? false : { title: request.title, payload }
    },
    dedupeKey: (tab) => {
      const target = officialBrowserTargetOf(tab.payload)
      return target === undefined ? undefined : officialBrowserTargetKey(target)
    },
    onOpen: (tab, context) => { runtime.ensure(context.sessionId, tab.id) },
    onActivate: (tab, context) => {
      const projected = browserTabs(ctx.sidebarRight.getSnapshot())
        .find(candidate => candidate.sessionId === context.sessionId && candidate.record.id === tab.id)
      if (projected !== undefined) void runtime.activate(projected)
    },
    settings: { fields: browserSettings(copy) },
    close: close => runtime.close(close),
  }
}
