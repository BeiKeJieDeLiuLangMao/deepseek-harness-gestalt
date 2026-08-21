import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CompanionInteraction } from './companion-approval.ts'
import {
  COMPANION_HISTORY_PAGE_SIZE,
  companionSessionPending,
  filterCompanionSessions,
  groupCompanionSessions,
  revealCompanionHistory,
  type CompanionSessionSummary,
} from './companion-history.ts'
import type { CompanionPushState } from './companion-push.ts'
import type { MobileContentBlock } from './mobile-content.ts'
import { MobileConversation } from './MobileConversation.tsx'
import css from './MobileBrowse.module.css'

/** Mobile Companion browse props. */
export interface MobileBrowseProps {
  /** Selected Desktop display name. */
  desktopName: string
  /** Live Remote Online / Offline label, or unpaired before Personal Pairing. */
  connection: 'unpaired' | 'online' | 'offline'
  /** Desktop-confirmed Session history. */
  sessions: readonly CompanionSessionSummary[]
  /** Optional create handler used by Workspace and global create actions. */
  onCreate?: (input: { workspace?: string }) => void
  /** Submit a prompt through Desktop acceptance. */
  onSubmit?: (sessionId: string, text: string) => void
  /** Cancel the active prompt through Desktop cancellation. */
  onCancel?: (sessionId: string) => void
  /** Offer a local file on the open Session. */
  onAttach?: (sessionId: string, file: File) => void
  /** Forward a Desktop-authorized interaction settlement. */
  onSettled?: (sessionId: string, interaction: CompanionInteraction) => void
  /** Process visibility required before conversation settlement. */
  companionState?: CompanionPushState
  /** GitHub login shown on the home header. */
  accountLogin?: string
  /** GitHub avatar URL shown on the home header. */
  accountAvatarUrl?: string
  /** Open the current-installation account page. */
  onOpenAccount?: () => void
  /** Open the Personal Pairing scan page. */
  onScanPairing?: () => void
  /** Re-run Desktop-authoritative synchronization. */
  onRecover?: () => void
  /** Ask Desktop to project Host history for the opened Session. */
  onOpenSession?: (sessionId: string) => void
  /** Ask Desktop to search Host Sessions. */
  onSearch?: (query: string) => void
  /** Desktop-confirmed search hits for the last ready query. */
  searchHits?: readonly CompanionSessionSummary[]
  /** Host search progress. */
  searchStatus?: 'idle' | 'loading' | 'ready' | 'error'
  /** Last Host or transport failure. */
  searchError?: string
}

/** Phone-sized Workspace/Session browse without Desktop columns. */
export function MobileBrowse({
  desktopName,
  connection,
  sessions,
  onCreate,
  onSubmit,
  onCancel,
  onAttach,
  onSettled,
  companionState,
  accountLogin,
  accountAvatarUrl,
  onOpenAccount,
  onScanPairing,
  onRecover,
  onOpenSession,
  onSearch,
  searchHits,
  searchStatus = 'idle',
  searchError,
}: MobileBrowseProps): ReactNode {
  const [openId, setOpenId] = useState<string>()
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [query, setQuery] = useState('')
  const [pages, setPages] = useState(1)
  const canCreate = onCreate !== undefined && connection === 'online'
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch
  useEffect(() => {
    const timer = window.setTimeout(() => { onSearchRef.current?.(query) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [query])
  const visibleSessions = useMemo(() => {
    const needle = query.trim()
    if (needle === '') return sessions
    if (searchStatus === 'ready' && searchHits !== undefined) return searchHits
    return filterCompanionSessions(sessions, needle)
  }, [query, searchHits, searchStatus, sessions])
  const paged = useMemo(
    () => revealCompanionHistory(visibleSessions, pages, COMPANION_HISTORY_PAGE_SIZE),
    [visibleSessions, pages],
  )
  const grouped = useMemo(() => groupCompanionSessions(paged.visible), [paged.visible])
  const open = openId === undefined
    ? undefined
    : sessions.find(session => session.id === openId)
      ?? searchHits?.find(session => session.id === openId)
  const openSession = (sessionId: string): void => {
    setOpenId(sessionId)
    onOpenSession?.(sessionId)
  }
  const connectionLabel = connection === 'unpaired'
    ? '未连接'
    : connection === 'online' ? 'Remote Online' : 'Remote Offline'

  if (connection !== 'unpaired' && open !== undefined) {
    return (
      <MobileConversation
        title={open.title}
        context={open.workspace ?? open.project ?? 'Ungrouped'}
        connection={connection === 'online' ? 'online' : 'offline'}
        onBack={() => { setOpenId(undefined) }}
        blocks={conversationBlocks(open)}
        streaming={open.live === true}
        opening={connection === 'online' && conversationBlocks(open).length === 0 && open.transcript === undefined}
        {...(searchError === undefined ? {} : { error: searchError })}
        {...(onSubmit === undefined ? {} : { onSubmit: (text) => { onSubmit(open.id, text) } })}
        {...(onCancel === undefined ? {} : { onCancel: () => { onCancel(open.id) } })}
        {...(onAttach === undefined ? {} : { onAttach: (file) => { onAttach(open.id, file) } })}
        {...(onSettled === undefined ? {} : { onSettled: (interaction) => { onSettled(open.id, interaction) } })}
        {...(companionState === undefined ? {} : { companionState })}
        {...(onRecover === undefined ? {} : { onRecover })}
      />
    )
  }

  return (
    <section className={css.page} data-mobile-browse="list">
      <header className={css.remoteHeader}>
        {onOpenAccount === undefined || accountLogin === undefined
          ? <span className={css.headerSlot} />
          : (
            <button type="button" className={css.account} aria-label="查看账号" onClick={onOpenAccount}>
              {accountAvatarUrl === undefined
                ? null
                : <img src={accountAvatarUrl} alt="" />}
              <span>@{accountLogin}</span>
            </button>
          )}
        <div>
          <strong>远程</strong>
          {connection !== 'unpaired' && (
            <span>
              <i className={connection === 'offline' ? css.dotOffline : css.dotOnline} />
              {laptopIcon}
              {desktopName}
            </span>
          )}
          <p className={css.connection} data-connection={connection}>{connectionLabel}</p>
        </div>
        {onScanPairing === undefined
          ? <span className={css.headerSlot} />
          : (
            <button type="button" className={css.iconButton} aria-label="扫描配对" onClick={onScanPairing}>
              {scanIcon}
            </button>
          )}
      </header>
      <main className={css.projectList}>
        {connection === 'unpaired' ? (
          <p className={css.empty}>扫码连接 Desktop 后即可查看 Session</p>
        ) : (
          <>
            <div className={css.projectTitle}>
              <h2>项目</h2>
              {onCreate !== undefined && (
                <button
                  type="button"
                  className={css.textAction}
                  disabled={!canCreate}
                  onClick={() => { setWorkspaceOpen(true) }}
                >
                  新建 Workspace
                </button>
              )}
            </div>
            {searchError !== undefined && <p className={css.error} role="alert">{searchError}</p>}
            {searchStatus === 'loading' && query.trim() !== '' && (
              <p className={css.searchStatus} role="status">正在从 Desktop 搜索…</p>
            )}
            {sessions.length === 0 && query.trim() === '' && <p className={css.empty}>还没有 Session</p>}
            {query.trim() !== '' && searchStatus === 'ready' && visibleSessions.length === 0 && (
              <p className={css.empty}>没有匹配的聊天记录</p>
            )}
            {grouped.groups.map(group => (
              <section key={group.name} className={css.group} aria-label={group.name}>
                <header>
                  <div className={css.projectName}>
                    {folderIcon}
                    <strong>{group.name}</strong>
                  </div>
                  {onCreate !== undefined && (
                    <button
                      type="button"
                      className={css.compose}
                      disabled={!canCreate}
                      aria-label={`在 ${group.name} 新建 Session`}
                      onClick={() => { onCreate({ workspace: group.name }) }}
                    >
                      {composeIcon}
                    </button>
                  )}
                </header>
                <SessionList sessions={group.sessions} onOpen={openSession} />
              </section>
            ))}
            {grouped.ungrouped.length > 0 && (
              <section className={css.group} aria-label="Ungrouped">
                <header>
                  <div className={css.projectName}>
                    {folderIcon}
                    <strong>Ungrouped</strong>
                  </div>
                  {onCreate !== undefined && (
                    <button
                      type="button"
                      className={css.compose}
                      disabled={!canCreate}
                      aria-label="在 Ungrouped 新建 Session"
                      onClick={() => { onCreate({}) }}
                    >
                      {composeIcon}
                    </button>
                  )}
                </header>
                <SessionList sessions={grouped.ungrouped} onOpen={openSession} />
              </section>
            )}
            {paged.spilled > 0 && (
              <button type="button" className={css.more} onClick={() => { setPages(current => current + 1) }}>
                加载更多（还有 {paged.spilled}）
              </button>
            )}
          </>
        )}
      </main>
      {connection !== 'unpaired' && (
        <footer className={css.dock}>
          <div className={css.chatHeading}>
            <span>聊天</span>
            {onCreate !== undefined && (
              <button
                type="button"
                className={css.compose}
                disabled={!canCreate}
                aria-label="新建聊天"
                onClick={() => { onCreate({}) }}
              >
                {composeIcon}
              </button>
            )}
          </div>
          <div className={css.dockActions}>
            <label className={css.search}>
              {searchIcon}
              <input
                aria-label="搜索聊天记录"
                placeholder="搜索聊天记录"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPages(1)
                }}
              />
            </label>
            {onCreate !== undefined && (
              <button
                type="button"
                className={css.round}
                disabled={!canCreate}
                aria-label="新建 Ungrouped Session"
                onClick={() => { onCreate({}) }}
              >
                {composeIcon}
              </button>
            )}
          </div>
        </footer>
      )}
      {connection !== 'unpaired' && workspaceOpen && onCreate !== undefined && (
        <section className={css.sheet} role="dialog" aria-label="新建 Workspace">
          <h2>在新 Workspace 新建 Session</h2>
          <input
            aria-label="Workspace 名称"
            value={workspaceName}
            disabled={!canCreate}
            placeholder="Workspace 名称"
            onChange={(event) => { setWorkspaceName(event.target.value) }}
          />
          <button
            type="button"
            disabled={!canCreate || workspaceName.trim() === ''}
            onClick={() => {
              const workspace = workspaceName.trim()
              if (workspace === '') return
              onCreate({ workspace })
              setWorkspaceName('')
              setWorkspaceOpen(false)
            }}
          >
            在新 Workspace 新建 Session
          </button>
          <button type="button" className={css.sheetClose} onClick={() => { setWorkspaceOpen(false) }}>取消</button>
        </section>
      )}
    </section>
  )
}

function conversationBlocks(session: CompanionSessionSummary): readonly MobileContentBlock[] {
  if (session.blocks !== undefined && session.blocks.length > 0) return session.blocks
  return (session.transcript ?? []).map(text => ({ kind: 'markdown' as const, text }))
}

function SessionList({
  sessions,
  onOpen,
}: {
  sessions: readonly CompanionSessionSummary[]
  onOpen: (id: string) => void
}): ReactNode {
  return (
    <ul className={css.sessions}>
      {sessions.map(session => (
        <li key={session.id}>
          <button type="button" className={css.session} onClick={() => { onOpen(session.id) }}>
            <strong>{session.title}</strong>
            {companionSessionPending(session)
              ? <em>待处理</em>
              : session.live === true ? <i className={css.running} /> : <span>{session.snippet ?? session.summary}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

const scanIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M7 5H5v2M17 5h2v2M7 19H5v-2M17 19h2v-2M8 12h8" />
  </svg>
)
const folderIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v7A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" />
  </svg>
)
const laptopIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="4" y="5" width="16" height="11" rx="1.5" />
    <path d="M2 19h20" />
  </svg>
)
const searchIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>
)
const composeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M13.5 5.5 18.5 10.5M4 20l3.2-.7L19 7.5a2.1 2.1 0 0 0-3-3L4.7 16.3 4 20Z" />
  </svg>
)
