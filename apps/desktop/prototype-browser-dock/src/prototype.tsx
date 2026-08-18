import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode, SVGProps } from 'react'
import { AppFrame } from '../../../../packages/client/ui-layout/src/client/AppFrame.tsx'

type Variant = 'codex' | 'edge' | 'tray'
type BrowserStatus = 'running' | 'waiting' | 'complete' | 'error'

interface BrowserTab {
  id: string
  title: string
  domain: string
  kind: 'github' | 'docs' | 'search' | 'profile'
}

interface BrowserInstance {
  id: string
  name: string
  profile: string
  tabs: readonly BrowserTab[]
  activeTabId: string
}

interface SessionBrowserState {
  dockOpen: boolean
  manuallyCollapsed: boolean
  status: BrowserStatus
  activeInstanceId: string
  instances: readonly BrowserInstance[]
}

interface SessionItem {
  id: string
  title: string
  meta: string
  browser: SessionBrowserState | null
}

const TABS_RESEARCH: readonly BrowserTab[] = [
  { id: 'tandem', title: 'Tandem Browser', domain: 'github.com', kind: 'github' },
  { id: 'tool-search', title: 'Tool search', domain: 'developers.openai.com', kind: 'docs' },
  { id: 'results', title: 'Agent browser runtimes', domain: 'google.com', kind: 'search' },
]

const TABS_PROFILE: readonly BrowserTab[] = [
  { id: 'merchant', title: '商家工作台', domain: 'merchant.example', kind: 'profile' },
  { id: 'orders', title: '订单列表', domain: 'merchant.example', kind: 'search' },
]

const initialSessions: readonly SessionItem[] = [
  {
    id: 'browser-research',
    title: '比较 CEF 与 ego-lite 浏览器',
    meta: '正在使用 2 个浏览器',
    browser: {
      dockOpen: true,
      manuallyCollapsed: false,
      status: 'running',
      activeInstanceId: 'research',
      instances: [
        { id: 'research', name: '资料研究', profile: '临时 Profile', tabs: TABS_RESEARCH, activeTabId: 'tandem' },
        { id: 'merchant', name: '商家后台', profile: '商家 Profile', tabs: TABS_PROFILE, activeTabId: 'merchant' },
      ],
    },
  },
  {
    id: 'github-platform',
    title: 'DSH #30 — GitHub Platform',
    meta: '浏览器已收起',
    browser: {
      dockOpen: false,
      manuallyCollapsed: true,
      status: 'waiting',
      activeInstanceId: 'research',
      instances: [
        { id: 'research', name: 'GitHub', profile: 'GitHub Profile', tabs: TABS_RESEARCH.slice(0, 2), activeTabId: 'tool-search' },
      ],
    },
  },
  {
    id: 'noise',
    title: 'DSH #28 — Noise security',
    meta: '没有浏览活动',
    browser: null,
  },
]

const STATUS_LABEL: Record<BrowserStatus, string> = {
  running: 'Agent 正在浏览',
  waiting: '等待你操作',
  complete: '浏览完成',
  error: '页面连接中断',
}

function iconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...props }
}

function PanelIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
}

function BackIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="m15 18-6-6 6-6" /></svg>
}

function ForwardIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="m9 18 6-6-6-6" /></svg>
}

function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M20 6v6h-6" /><path d="M4 18v-6h6" /><path d="M20 12a8 8 0 0 0-14.9-4M4 12a8 8 0 0 0 14.9 4" /></svg>
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M12 5v14M5 12h14" /></svg>
}

function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 20h14" /></svg>
}

function BrowserIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
}

function TerminalIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></svg>
}

function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M3 7.5h7l2-2h9v14H3z" /></svg>
}

function DotsIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>
}

function variantFromLocation(): Variant {
  const value = new URLSearchParams(window.location.search).get('variant')
  return value === 'edge' || value === 'tray' ? value : 'codex'
}

function findActiveInstance(state: SessionBrowserState): BrowserInstance {
  return state.instances.find(instance => instance.id === state.activeInstanceId) ?? state.instances[0]!
}

function findActiveTab(instance: BrowserInstance): BrowserTab {
  return instance.tabs.find(tab => tab.id === instance.activeTabId) ?? instance.tabs[0]!
}

function updateSessionBrowser(
  sessions: readonly SessionItem[],
  sessionId: string,
  update: (browser: SessionBrowserState) => SessionBrowserState,
): readonly SessionItem[] {
  return sessions.map(session => session.id === sessionId && session.browser !== null
    ? { ...session, browser: update(session.browser) }
    : session)
}

function Sidebar({ sessions, currentId, onSelect }: {
  sessions: readonly SessionItem[]
  currentId: string
  onSelect: (id: string) => void
}) {
  return (
    <aside className="prototype-sidebar">
      <div className="window-lights" aria-hidden="true"><i /><i /><i /></div>
      <div className="sidebar-brand"><span>Gestalt</span><button aria-label="切换工作区">⌄</button></div>
      <nav className="primary-nav" aria-label="主导航">
        <button><PlusIcon />新对话</button>
        <button><FolderIcon />项目</button>
        <button><TerminalIcon />终端</button>
      </nav>
      <div className="sidebar-label">项目</div>
      <div className="workspace-title"><FolderIcon />deepseek-harness</div>
      <div className="session-list">
        {sessions.map(session => (
          <button
            key={session.id}
            className="session-row"
            data-selected={session.id === currentId || undefined}
            onClick={() => { onSelect(session.id) }}
          >
            <span className="session-title">{session.title}</span>
            {session.browser !== null && <span className={`session-dot ${session.browser.status}`} aria-label={STATUS_LABEL[session.browser.status]} />}
            <small>{session.meta}</small>
          </button>
        ))}
      </div>
      <div className="sidebar-footer"><span className="avatar">YC</span><span>Yang Chen</span><button aria-label="帮助">?</button></div>
    </aside>
  )
}

function GenericToolCall({ name, detail, status = '完成' }: { name: string; detail: string; status?: string }) {
  return (
    <div className="tool-call">
      <span className="tool-icon"><TerminalIcon /></span>
      <span><strong>{name}</strong><small>{detail}</small></span>
      <span className="tool-status">{status}</span>
    </div>
  )
}

function Conversation({ session, variant, onOpenDock, onSelectPreviewTab, onAgentContinue, onReset }: {
  session: SessionItem
  variant: Variant
  onOpenDock: (instanceId?: string, tabId?: string) => void
  onSelectPreviewTab: (instanceId: string, tabId: string) => void
  onAgentContinue: () => void
  onReset: () => void
}) {
  const browser = session.browser
  return (
    <main className="conversation-shell">
      <header className="conversation-header">
        <div><FolderIcon /><strong>{session.title}</strong><button aria-label="更多会话操作"><DotsIcon /></button></div>
        <div className="header-actions"><button title="浏览器 Dock" aria-label="展开浏览器 Dock" onClick={() => { onOpenDock() }} disabled={browser === null}><PanelIcon /></button></div>
      </header>
      <section className="conversation-scroll">
        <article className="chat-thread">
          <p className="user-message">找一个适合 Gestalt 的跨平台 AI 浏览器方案，需要 Session 隔离、人工接管和工具懒加载。</p>
          <p>我会比较运行时边界，并验证 Profile、Cookie/storage、浏览器过程展示和工具 schema 的装载语义。</p>
          <GenericToolCall name="tool_search" detail="browser runtime · 8 个匹配工具" />
          <GenericToolCall name="browser.navigate" detail="github.com/hydro13/tandem-browser" status={browser?.status === 'running' ? '运行中' : '完成'} />
          <div className="assistant-summary">
            <h2>当前方向</h2>
            <p>Gestalt 拥有 Session 与原生浏览器视图；Profile 保存 Cookie 和 storage。浏览器工具仍使用与其他 MCP 工具一致的过程展示。</p>
            <ul><li>一个 Session 可包含多个 Profile 浏览器</li><li>Tab 在实例内以叠层切换</li><li>用户收起后，Agent 继续运行但不抢开 Dock</li></ul>
          </div>
        </article>
        {browser !== null && !browser.dockOpen && (
          <CollapsedBrowserSurface variant={variant} state={browser} onOpen={onOpenDock} onSelectTab={onSelectPreviewTab} />
        )}
      </section>
      <div className="composer-wrap">
        <div className="composer-card">
          <span className="composer-placeholder">随心输入</span>
          <div><button aria-label="添加">＋</button><span className="access-pill">完全访问</span><button className="send-button" aria-label="发送">↑</button></div>
        </div>
      </div>
      <div className="scenario-actions" aria-label="原型场景控制">
        <button onClick={onAgentContinue} disabled={browser === null}>Agent 继续浏览</button>
        <button onClick={onReset}>重置场景</button>
      </div>
    </main>
  )
}

function TabStack({ instance, status, compact = false, onSelect, onActivate }: {
  instance: BrowserInstance
  status: BrowserStatus
  compact?: boolean
  onSelect: (tabId: string) => void
  onActivate?: () => void
}) {
  const activeTab = findActiveTab(instance)
  const ordered = [...instance.tabs.filter(tab => tab.id !== activeTab.id), activeTab]
  return (
    <div className={`tab-stack ${compact ? 'compact' : ''}`} style={{ '--stack-count': instance.tabs.length } as React.CSSProperties}>
      {ordered.map((tab, index) => {
        const active = tab.id === instance.activeTabId
        return (
          <div
            key={tab.id}
            className="tab-layer"
            data-active={active || undefined}
            style={{ '--layer-index': index } as React.CSSProperties}
          >
            <button
              className="tab-layer-hit"
              onClick={(event) => {
                event.stopPropagation()
                if (active && onActivate !== undefined) onActivate()
                else onSelect(tab.id)
              }}
              aria-label={active && onActivate !== undefined ? `展开 ${tab.title}` : `切换到 ${tab.title}`}
            >
              <span className="tab-layer-top">
                <i className={`status-mark ${status}`} />{tab.domain}
                {active && <em>{STATUS_LABEL[status]}</em>}
                <small>{instance.tabs.findIndex(item => item.id === tab.id) + 1}</small>
              </span>
              <MiniPage kind={tab.kind} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function CollapsedBrowserSurface({ variant, state, onOpen, onSelectTab }: {
  variant: Variant
  state: SessionBrowserState
  onOpen: (instanceId?: string, tabId?: string) => void
  onSelectTab: (instanceId: string, tabId: string) => void
}) {
  const active = findActiveInstance(state)
  const stack = (
    <TabStack
      instance={active}
      status={state.status}
      compact={variant !== 'codex'}
      onSelect={(tabId) => { onSelectTab(active.id, tabId) }}
      onActivate={() => { onOpen(active.id) }}
    />
  )
  const content = (
    <div className="preview-card" data-variant={variant}>
      <div className="preview-heading">
        <span><BrowserIcon /><strong>{active.name}</strong></span>
        <span className={`preview-status ${state.status}`}><i />{STATUS_LABEL[state.status]}</span>
      </div>
      {stack}
      <div className="preview-footer">
        <span>{active.profile}</span>
        <button onClick={() => { onOpen(active.id) }}>展开浏览器 <PanelIcon /></button>
      </div>
    </div>
  )

  if (variant === 'codex') return <div className="preview-float">{stack}</div>
  if (variant === 'edge') return <div className="preview-edge" tabIndex={0}>{content}</div>
  if (variant === 'tray') {
    return (
      <div className="preview-tray">
        <div className="tray-label"><BrowserIcon /><span>浏览器</span><small>{state.instances.length} 个实例</small></div>
        {state.instances.map(instance => (
          <button key={instance.id} className="tray-instance" onClick={() => { onOpen(instance.id) }}>
            <span className={`status-mark ${state.status}`} />
            <span><strong>{instance.name}</strong><small>{instance.profile} · {instance.tabs.length} 个标签页</small></span>
            <span className="mini-fan" aria-hidden="true"><i /><i /><i /></span>
          </button>
        ))}
      </div>
    )
  }
  return null
}

function MiniPage({ kind }: { kind: BrowserTab['kind'] }) {
  if (kind === 'github') return <div className="mini-page github"><i /><b /><b /><span /><span /><span /></div>
  if (kind === 'docs') return <div className="mini-page docs"><b /><i /><span /><span /><span /><em /></div>
  if (kind === 'profile') return <div className="mini-page profile"><b /><i /><i /><span /><span /></div>
  return <div className="mini-page search"><b /><span /><span /><i /><span /></div>
}

function BrowserPage({ tab }: { tab: BrowserTab }) {
  if (tab.kind === 'github') {
    return (
      <div className="browser-page github-page">
        <div className="repo-kicker">hydro13 / <strong>tandem-browser</strong></div>
        <h1>Tandem Browser</h1>
        <p>A browser built for humans and agents to work together.</p>
        <div className="repo-stats"><span>MIT</span><span>257 tools</span><span>Electron</span></div>
        <div className="readme-block"><b>Why not just use Playwright?</b><i /><i /><i /><i /></div>
      </div>
    )
  }
  if (tab.kind === 'docs') {
    return (
      <div className="browser-page docs-page">
        <small>OPENAI DEVELOPERS</small><h1>Tool search</h1>
        <p>Load deferred tools only when the model needs them.</p>
        <div className="code-block"><span>tool_search</span><br />→ tool_search_output<br />→ next model call</div>
        <h2>Deferred tools</h2><p>Matching schemas are returned as tool output rather than permanently activated.</p>
      </div>
    )
  }
  if (tab.kind === 'profile') {
    return (
      <div className="browser-page profile-page">
        <div className="merchant-head"><b>商家工作台</b><span>商家 Profile</span></div>
        <h1>欢迎回来</h1><p>此浏览器会自动保存登录状态和站点数据。</p>
        <div className="profile-grid"><i /><i /><i /></div>
      </div>
    )
  }
  return (
    <div className="browser-page search-page">
      <div className="search-query">agent browser runtimes</div>
      <small>约 12,400 条结果</small>
      <h2>Tandem Browser — GitHub</h2><p>Real tabs, isolated profiles, MCP and HTTP APIs.</p>
      <h2>BrowserOS</h2><p>An open-source browser for AI agents.</p>
      <h2>ego-lite</h2><p>Visible agent sessions with human takeover.</p>
    </div>
  )
}

function BrowserDock({ state, onClose, onSelectTab }: {
  state: SessionBrowserState | null
  onClose: () => void
  onSelectTab: (id: string) => void
}) {
  if (state === null) return <aside className="browser-dock empty" />
  const instance = findActiveInstance(state)
  const tab = findActiveTab(instance)
  return (
    <aside className="browser-dock">
      <div className="dock-tabs" role="tablist">
        {instance.tabs.map(item => (
          <button key={item.id} role="tab" aria-selected={item.id === tab.id} onClick={() => { onSelectTab(item.id) }}>
            <span>{item.title}</span><CloseIcon />
          </button>
        ))}
        <button className="new-tab" aria-label="新建标签页"><PlusIcon /></button>
        <button className="dock-collapse" onClick={onClose} aria-label="收起浏览器"><PanelIcon /></button>
      </div>
      <div className="browser-toolbar">
        <button disabled aria-label="后退"><BackIcon /></button><button aria-label="前进"><ForwardIcon /></button><button aria-label="刷新"><RefreshIcon /></button>
        <label>
          <span className="site-lock">●</span>
          {instance.profile !== '临时 Profile' && <span className="profile-chip">{instance.profile}</span>}
          <input value={tab.domain} readOnly aria-label="地址" />
        </label>
        <button aria-label="下载"><DownloadIcon /></button>
      </div>
      <div className="browser-viewport"><BrowserPage tab={tab} /></div>
      <div className="dock-foot"><span>{instance.tabs.length} 个标签页</span></div>
    </aside>
  )
}

function StateInspector({ session, variant }: { session: SessionItem; variant: Variant }) {
  const browser = session.browser
  return (
    <details className="state-inspector">
      <summary>状态</summary>
      <pre>{JSON.stringify({ variant, session: session.id, browser: browser === null ? null : {
        dockOpen: browser.dockOpen,
        manuallyCollapsed: browser.manuallyCollapsed,
        status: browser.status,
        activeInstance: browser.activeInstanceId,
        instances: browser.instances.map(instance => ({
          profile: instance.profile,
          activeTab: instance.activeTabId,
          tabs: instance.tabs.length,
        })),
      } }, null, 2)}</pre>
    </details>
  )
}

function PrototypeControls({ variant, onVariant, status, onStatus }: {
  variant: Variant
  onVariant: (variant: Variant) => void
  status: BrowserStatus | null
  onStatus: (status: BrowserStatus) => void
}) {
  return (
    <div className="prototype-controls">
      <span className="prototype-tag">PROTOTYPE · 不进入主分支</span>
      <div className="control-group" aria-label="预览方案">
        <button data-active={variant === 'codex' || undefined} onClick={() => { onVariant('codex') }}>A 悬浮卡</button>
        <button data-active={variant === 'edge' || undefined} onClick={() => { onVariant('edge') }}>B 边缘卡舌</button>
        <button data-active={variant === 'tray' || undefined} onClick={() => { onVariant('tray') }}>C 活动托盘</button>
      </div>
      <div className="control-group status-control" aria-label="浏览器状态">
        {(['running', 'waiting', 'complete', 'error'] as const).map(item => (
          <button
            key={item}
            disabled={status === null}
            data-active={status === item || undefined}
            onClick={() => { onStatus(item) }}
          >
            {STATUS_LABEL[item]}
          </button>
        ))}
      </div>
    </div>
  )
}

export function BrowserDockPrototype() {
  const [variant, setVariantState] = useState<Variant>(variantFromLocation)
  const [sessions, setSessions] = useState(initialSessions)
  const [currentId, setCurrentId] = useState(initialSessions[0]!.id)
  const current = sessions.find(session => session.id === currentId) ?? sessions[0]!
  const browser = current.browser
  const [layout, setLayout] = useState({
    sidebar: 280,
    details: browser?.dockOpen ? 520 : 0,
    narrow: false,
    narrowExpanded: false,
  })

  useEffect(() => {
    setLayout(previous => ({ ...previous, details: browser?.dockOpen ? Math.max(previous.details, 500) : 0 }))
  }, [browser?.dockOpen, currentId])

  const setVariant = useCallback((next: Variant) => {
    setVariantState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState(null, '', url)
  }, [])

  const updateCurrentBrowser = useCallback((update: (browser: SessionBrowserState) => SessionBrowserState) => {
    setSessions(previous => updateSessionBrowser(previous, currentId, update))
  }, [currentId])

  const openDock = useCallback((instanceId?: string, tabId?: string) => {
    updateCurrentBrowser(state => ({
      ...state,
      dockOpen: true,
      manuallyCollapsed: false,
      activeInstanceId: instanceId ?? state.activeInstanceId,
      instances: tabId === undefined
        ? state.instances
        : state.instances.map(instance => instance.id === (instanceId ?? state.activeInstanceId)
          ? { ...instance, activeTabId: tabId }
          : instance),
    }))
  }, [updateCurrentBrowser])

  const closeDock = useCallback(() => {
    updateCurrentBrowser(state => ({ ...state, dockOpen: false, manuallyCollapsed: true }))
  }, [updateCurrentBrowser])

  const agentContinue = useCallback(() => {
    updateCurrentBrowser(state => ({ ...state, status: 'running', dockOpen: state.manuallyCollapsed ? false : true }))
  }, [updateCurrentBrowser])

  const reset = useCallback(() => {
    setSessions(initialSessions)
    setCurrentId(initialSessions[0]!.id)
  }, [])

  const actions = useMemo(() => ({
    setSidebar: (px: number) => { setLayout(previous => ({ ...previous, sidebar: Math.max(180, Math.min(360, px)) })) },
    setDetails: (px: number) => { setLayout(previous => ({ ...previous, details: Math.max(300, Math.min(960, px)) })) },
    toggleSidebar: () => { setLayout(previous => ({ ...previous, sidebar: previous.sidebar === 0 ? 280 : 0 })) },
    setNarrow: (narrow: boolean) => {
      setLayout(previous => previous.narrow === narrow ? previous : { ...previous, narrow, narrowExpanded: false })
    },
    openDetails: () => { setLayout(previous => ({ ...previous, details: 520 })) },
    closeDetails: () => { setLayout(previous => ({ ...previous, details: 0 })) },
  }), [])

  const selectTab = useCallback((id: string) => {
    updateCurrentBrowser(state => ({
      ...state,
      instances: state.instances.map(instance => instance.id === state.activeInstanceId
        ? { ...instance, activeTabId: id }
        : instance),
    }))
  }, [updateCurrentBrowser])

  const selectPreviewTab = useCallback((instanceId: string, tabId: string) => {
    updateCurrentBrowser(state => ({
      ...state,
      activeInstanceId: instanceId,
      instances: state.instances.map(instance => instance.id === instanceId ? { ...instance, activeTabId: tabId } : instance),
    }))
  }, [updateCurrentBrowser])

  const setStatus = useCallback((status: BrowserStatus) => {
    updateCurrentBrowser(state => ({ ...state, status }))
  }, [updateCurrentBrowser])

  const renderSlot = useCallback((name: string): ReactNode => {
    if (name === 'sidebar') return <Sidebar sessions={sessions} currentId={currentId} onSelect={setCurrentId} />
    if (name === 'conversation') return <Conversation session={current} variant={variant} onOpenDock={openDock} onSelectPreviewTab={selectPreviewTab} onAgentContinue={agentContinue} onReset={reset} />
    if (name === 'details') return <BrowserDock state={browser} onClose={closeDock} onSelectTab={selectTab} />
    return null
  }, [agentContinue, browser, closeDock, current, currentId, openDock, reset, selectPreviewTab, selectTab, sessions, variant])

  const fakeList = useMemo(() => ({ current: 'prototype-session', byId: { 'prototype-session': { id: 'prototype-session', displayTitle: current.title, blank: false, running: browser?.status === 'running', updatedAt: 1 } }, ids: ['prototype-session'], phase: 'ready' }), [browser?.status, current.title])

  return (
    <div className="prototype-root">
      <AppFrame {...({
        useStore: (select: (state: typeof layout) => unknown) => select(layout),
        actions,
        renderSlot,
        useSessions: (select: (state: typeof fakeList) => unknown) => select(fakeList),
        useWorkspaces: (select: (state: object) => unknown) => select({}),
        SessionProvider: ({ children }: { children: (id: string) => ReactNode }) => children('prototype-session'),
      } as never)} />
      <StateInspector session={current} variant={variant} />
      <PrototypeControls variant={variant} onVariant={setVariant} status={browser?.status ?? null} onStatus={setStatus} />
    </div>
  )
}
