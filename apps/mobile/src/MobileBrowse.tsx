import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  COMPANION_HISTORY_PAGE_SIZE,
  groupCompanionSessions,
  pageCompanionHistory,
  type CompanionSessionSummary,
} from './companion-history.ts'
import { companionMayMutate, type CompanionConnectionState } from './companion-lifecycle.ts'
import type { CompanionInteraction } from './companion-approval.ts'
import type { MobileCompanionSearchSnapshot } from './companion-surface.ts'
import { MobileConversation } from './MobileConversation.tsx'
import css from './MobileBrowse.module.css'

/** Mobile Companion browse props. */
export interface MobileBrowseProps {
  /** Selected Desktop display name. */
  desktopName: string
  /** Live Remote Online / Offline label. */
  connection: 'online' | 'offline'
  /** Desktop-confirmed Session history. */
  sessions: readonly CompanionSessionSummary[]
  /** Optional create handler used by Workspace and global create actions. */
  onCreate?: (input: { workspace?: string }) => void
  /** Submit a prompt for the opened Session. */
  onSubmit?: (sessionId: string, text: string) => void
  /** Cancel execution for the opened Session. */
  onCancel?: (sessionId: string) => void
  /** Select an attachment for the opened Session. */
  onAttach?: (sessionId: string, file: File) => void
  /** Desktop-authoritative full-text Session search state. */
  search?: MobileCompanionSearchSnapshot
  /** Request one full-text Session search from Desktop. */
  onSearch?: (query: string) => void
  /** Whether the opened Session is streaming. */
  streaming?: boolean
  /** Receive a Desktop-authoritative interaction settlement. */
  onSettled?: (interaction: CompanionInteraction) => void
  /** Process visibility required before conversation settlement. */
  companionState?: CompanionConnectionState
}

/** Phone-sized Workspace/Session browse without Desktop columns. */
export function MobileBrowse({
  desktopName, connection, sessions, onCreate, onSubmit, onCancel, onAttach, search, onSearch,
  streaming = false, companionState, onSettled,
}: MobileBrowseProps): ReactNode {
  const [openId, setOpenId] = useState<string>()
  const [page, setPage] = useState(0)
  const [searchDraft, setSearchDraft] = useState(search?.query ?? '')
  useEffect(() => { setSearchDraft(search?.query ?? '') }, [search?.query])
  const searchActive = search !== undefined && search.query !== ''
  const paged = useMemo(
    () => pageCompanionHistory(sessions, page, COMPANION_HISTORY_PAGE_SIZE),
    [page, sessions],
  )
  const grouped = useMemo(() => groupCompanionSessions(paged.visible), [paged.visible])
  const open = sessions.find(session => session.id === openId)
  const mayMutate = companionMayMutate(companionState)

  if (open !== undefined) {
    if (open.blocks !== undefined) {
      return (
        <MobileConversation
          title={open.title}
          onBack={() => { setOpenId(undefined) }}
          blocks={open.blocks}
          {...(onSubmit === undefined ? {} : { onSubmit: (text: string) => { onSubmit(open.id, text) } })}
          {...(onCancel === undefined ? {} : { onCancel: () => { onCancel(open.id) } })}
          {...(onAttach === undefined ? {} : { onAttach: (file: File) => { onAttach(open.id, file) } })}
          streaming={streaming}
          {...(onSettled === undefined ? {} : { onSettled })}
          {...(companionState === undefined ? {} : { companionState })}
        />
      )
    }
    return (
      <section className={css.page} data-mobile-browse="conversation">
        <header className={css.header}>
          <button type="button" className={css.back} onClick={() => { setOpenId(undefined) }}>返回</button>
          <h1>{open.title}</h1>
        </header>
        {open.live === true && open.transcript !== undefined
          ? <ol className={css.transcript}>{open.transcript.map((line, index) => <li key={index}>{line}</li>)}</ol>
          : <p className={css.summary}>{open.summary}</p>}
      </section>
    )
  }

  return (
    <section className={css.page} data-mobile-browse="list">
      <header className={css.header}>
        <p className={css.desktop}>{desktopName}</p>
        <p className={css.connection} data-connection={connection}>{connection === 'online' ? 'Remote Online' : 'Remote Offline'}</p>
        {onSearch !== undefined && (
          <form
            className={css.search}
            onSubmit={(event) => { event.preventDefault(); onSearch(searchDraft) }}
          >
            <input
              type="search"
              aria-label="搜索 Desktop Sessions"
              value={searchDraft}
              disabled={!mayMutate}
              onChange={(event) => { setSearchDraft(event.target.value) }}
            />
            <button type="submit" disabled={!mayMutate}>搜索</button>
          </form>
        )}
        {search?.status === 'error' && <p role="alert">{search.error.message}</p>}
        {onCreate !== undefined && (
          <button type="button" disabled={!mayMutate} onClick={() => { if (mayMutate) onCreate({}) }}>新建 Ungrouped Session</button>
        )}
      </header>
      {search !== undefined && search.status !== 'idle' && <AuthoritativeSearchResults search={search} />}
      {!searchActive && grouped.groups.map(group => (
        <section key={group.name} className={css.group} aria-label={group.name}>
          <h2>{group.name}</h2>
          {onCreate !== undefined && (
            <button type="button" disabled={!mayMutate} onClick={() => { if (mayMutate) onCreate({ workspace: group.name }) }}>在 {group.name} 新建 Session</button>
          )}
          <SessionList sessions={group.sessions} onOpen={setOpenId} />
        </section>
      ))}
      {!searchActive && grouped.ungrouped.length > 0 && (
        <section className={css.group} aria-label="Ungrouped">
          <h2>Ungrouped</h2>
          <SessionList sessions={grouped.ungrouped} onOpen={setOpenId} />
        </section>
      )}
      {searchActive && search.items.length === 0 && search.status !== 'loading' && <p>没有匹配的 Session</p>}
      {search?.status === 'loading' && <p>正在搜索 Desktop Session 内容…</p>}
      {search?.hasMore === true && <p>结果较多，请缩小搜索范围。</p>}
      {!searchActive && paged.spilled > 0 && (
        <button type="button" className={css.more} onClick={() => { setPage(current => current + 1) }}>
          加载更多（还有 {paged.spilled}）
        </button>
      )}
    </section>
  )
}

function AuthoritativeSearchResults({ search }: { search: Exclude<MobileCompanionSearchSnapshot, { query: '' }> }): ReactNode {
  return (
    <section className={css.group} aria-label="Desktop 搜索结果">
      <h2>Desktop 搜索结果</h2>
      <ul className={css.sessions}>
        {search.items.map(hit => (
          <li key={hit.sessionId} className={css.searchResult}>
            <strong>{hit.sessionId}</strong>
            <span>{hit.snippet}</span>
          </li>
        ))}
      </ul>
    </section>
  )
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
          <button type="button" onClick={() => { onOpen(session.id) }}>
            <strong>{session.title}</strong>
            <span>{session.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
