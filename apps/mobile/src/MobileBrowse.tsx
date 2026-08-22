import { useMemo, useState, type ReactNode } from 'react'
import {
  COMPANION_HISTORY_PAGE_SIZE,
  groupCompanionSessions,
  pageCompanionHistory,
  type CompanionSessionSummary,
} from './companion-history.ts'
import { companionMayMutate, type CompanionConnectionState } from './companion-lifecycle.ts'
import type { CompanionInteraction } from './companion-approval.ts'
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
  onAttach?: (sessionId: string) => void
  /** Whether the opened Session is streaming. */
  streaming?: boolean
  /** Receive a Desktop-authoritative interaction settlement. */
  onSettled?: (interaction: CompanionInteraction) => void
  /** Process visibility required before conversation settlement. */
  companionState?: CompanionConnectionState
}

/** Phone-sized Workspace/Session browse without Desktop columns. */
export function MobileBrowse({
  desktopName, connection, sessions, onCreate, onSubmit, onCancel, onAttach,
  streaming = false, companionState, onSettled,
}: MobileBrowseProps): ReactNode {
  const [openId, setOpenId] = useState<string>()
  const [page, setPage] = useState(0)
  const paged = useMemo(
    () => pageCompanionHistory(sessions, page, COMPANION_HISTORY_PAGE_SIZE),
    [sessions, page],
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
          {...(onAttach === undefined ? {} : { onAttach: () => { onAttach(open.id) } })}
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
        {onCreate !== undefined && (
          <button type="button" disabled={!mayMutate} onClick={() => { if (mayMutate) onCreate({}) }}>新建 Ungrouped Session</button>
        )}
      </header>
      {grouped.groups.map(group => (
        <section key={group.name} className={css.group} aria-label={group.name}>
          <h2>{group.name}</h2>
          {onCreate !== undefined && (
            <button type="button" disabled={!mayMutate} onClick={() => { if (mayMutate) onCreate({ workspace: group.name }) }}>在 {group.name} 新建 Session</button>
          )}
          <SessionList sessions={group.sessions} onOpen={setOpenId} />
        </section>
      ))}
      {grouped.ungrouped.length > 0 && (
        <section className={css.group} aria-label="Ungrouped">
          <h2>Ungrouped</h2>
          <SessionList sessions={grouped.ungrouped} onOpen={setOpenId} />
        </section>
      )}
      {paged.spilled > 0 && (
        <button type="button" className={css.more} onClick={() => { setPage(current => current + 1) }}>
          加载更多（还有 {paged.spilled}）
        </button>
      )}
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
