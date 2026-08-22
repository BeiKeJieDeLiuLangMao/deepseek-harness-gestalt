import { useMemo, useState, type ReactNode } from 'react'
import {
  COMPANION_HISTORY_PAGE_SIZE,
  groupCompanionSessions,
  pageCompanionHistory,
  type CompanionSessionSummary,
} from './companion-history.ts'
import { MobileConversation } from './MobileConversation.tsx'
import type { ConversationPresentationLocale } from '@deepseek-ai/dsh-client-ui-conversation/presentation'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import css from './MobileBrowse.module.css'

/** Mobile Companion browse props. */
export interface MobileBrowseProps {
  /** Selected Desktop display name. */
  desktopName: string
  /** Live Remote Online / Offline label. */
  connection: 'online' | 'offline'
  /** Desktop-confirmed Session history. */
  sessions: readonly CompanionSessionSummary[]
  /** Product locale inherited by list and detail views. */
  locale: ConversationPresentationLocale
  /** Product theme inherited by shared detail components. */
  theme: 'light' | 'dark'
  /** Session-authorized historical-image loader. */
  loadImage: (sessionId: string, attachment: ImageAttachmentRef) => Promise<string>
  /** Whether the current foreground synchronization admits mutations. */
  canMutate: boolean
  /** Optional create handler used by Workspace and global create actions. */
  onCreate?: ((input: { workspace?: string }) => void) | undefined
  /** Submit one prompt to the selected Desktop Session. */
  onSubmit?: ((sessionId: string, text: string) => void | Promise<void>) | undefined
  /** Cancel one active Desktop Session. */
  onCancel?: ((sessionId: string) => void) | undefined
  /** Load older history for one selected Session. */
  onLoadOlder?: ((sessionId: string) => void) | undefined
}

/** Phone-sized Workspace/Session browse without Desktop columns. */
export function MobileBrowse({
  desktopName, connection, sessions, locale, theme, loadImage,
  canMutate, onCreate, onSubmit, onCancel, onLoadOlder,
}: MobileBrowseProps): ReactNode {
  const [openId, setOpenId] = useState<string>()
  const [page, setPage] = useState(0)
  const paged = useMemo(
    () => pageCompanionHistory(sessions, page, COMPANION_HISTORY_PAGE_SIZE),
    [sessions, page],
  )
  const grouped = useMemo(() => groupCompanionSessions(paged.visible), [paged.visible])
  const open = sessions.find(session => session.id === openId)

  if (open !== undefined) {
    if (open.conversation !== undefined) {
      return (
        <MobileConversation
          title={open.title}
          onBack={() => { setOpenId(undefined) }}
          snapshot={open.conversation}
          locale={locale}
          theme={theme}
          loadImage={attachment => loadImage(open.id, attachment)}
          cwd={open.cwd}
          mutationEnabled={canMutate}
          {...(onSubmit === undefined ? {} : { onSubmit: (text: string) => onSubmit(open.id, text) })}
          {...(onCancel === undefined ? {} : { onCancel: () => { onCancel(open.id) } })}
          {...(onLoadOlder === undefined ? {} : { onLoadOlder: () => { onLoadOlder(open.id) } })}
        />
      )
    }
    return (
      <section className={css.page} data-mobile-browse="conversation" data-theme={theme} lang={locale === 'zh' ? 'zh-CN' : 'en'}>
        <header className={css.header}>
          <button type="button" className={css.back} onClick={() => { setOpenId(undefined) }}>{locale === 'zh' ? '返回' : 'Back'}</button>
          <h1>{open.title}</h1>
        </header>
        <p className={css.summary}>{open.summary}</p>
      </section>
    )
  }

  return (
    <section className={css.page} data-mobile-browse="list" data-theme={theme} lang={locale === 'zh' ? 'zh-CN' : 'en'}>
      <header className={css.header}>
        <p className={css.desktop}>{desktopName}</p>
        <p className={css.connection} data-connection={connection}>{connection === 'online' ? 'Remote Online' : 'Remote Offline'}</p>
        {onCreate !== undefined && (
          <button type="button" disabled={!canMutate} onClick={() => { if (canMutate) onCreate({}) }}>
            {locale === 'zh' ? '新建 Ungrouped Session' : 'New ungrouped Session'}
          </button>
        )}
      </header>
      {grouped.groups.map(group => (
        <section key={group.name} className={css.group} aria-label={group.name}>
          <h2>{group.name}</h2>
          {onCreate !== undefined && (
            <button type="button" disabled={!canMutate} onClick={() => { if (canMutate) onCreate({ workspace: group.name }) }}>
              {locale === 'zh' ? `在 ${group.name} 新建 Session` : `New Session in ${group.name}`}
            </button>
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
          {locale === 'zh' ? `加载更多（还有 ${paged.spilled}）` : `Load more (${paged.spilled} remaining)`}
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
