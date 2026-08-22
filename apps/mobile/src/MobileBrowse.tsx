import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  COMPANION_HISTORY_PAGE_SIZE,
  pageCompanionHistory,
  type CompanionConversationMap,
} from './companion-history.ts'
import { MobileConversation } from './MobileConversation.tsx'
import type {
  SessionId, SessionListState, WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationPresentationLocale } from '@deepseek-ai/dsh-client-ui-conversation/presentation'
import {
  expandedSessionGroups, SessionListPresentation, workspacePresentationTranslate,
} from '@deepseek-ai/dsh-client-ui-workspace/presentation'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import css from './MobileBrowse.module.css'
import type { MobilePresentationClock } from './mobile-clock.ts'

/** Mobile Companion browse props. */
export interface MobileBrowseProps {
  /** Selected Desktop display name. */
  desktopName: string
  /** Live Remote Online / Offline label. */
  connection: 'online' | 'offline'
  /** Desktop-confirmed Session history. */
  sessions: SessionListState
  /** Desktop Workspace projection consumed by the shared grouping owner. */
  workspaces: readonly WorkspaceView[]
  /** Desktop conversations keyed by the same Session ids. */
  conversations: CompanionConversationMap
  /** Product locale inherited by list and detail views. */
  locale: ConversationPresentationLocale
  /** Product theme inherited by shared detail components. */
  theme: 'light' | 'dark'
  /** Session-authorized historical-image loader. */
  loadImage: (sessionId: string, attachment: ImageAttachmentRef) => Promise<string>
  /** Whether the current foreground synchronization admits mutations. */
  canMutate: boolean
  /** Live clock owner used by shared relative-time rows. */
  clock: MobilePresentationClock
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
  desktopName, connection, sessions, workspaces, conversations, locale, theme, loadImage,
  canMutate, clock, onCreate, onSubmit, onCancel, onLoadOlder,
}: MobileBrowseProps): ReactNode {
  const [openId, setOpenId] = useState<SessionId>()
  const [page, setPage] = useState(0)
  const paged = useMemo(
    () => pageCompanionHistory(sessions, workspaces, page, COMPANION_HISTORY_PAGE_SIZE),
    [sessions, workspaces, page],
  )
  const groups = useMemo(
    () => expandedSessionGroups(paged.sessions, paged.workspaces),
    [paged.sessions, paged.workspaces],
  )
  const tw = useMemo(() => workspacePresentationTranslate(locale), [locale])
  const now = useSyncExternalStore(
    listener => clock.subscribe(listener),
    () => clock.getSnapshot(),
  )
  const open = openId === undefined ? undefined : sessions.byId[openId]
  const conversation = openId === undefined ? undefined : conversations[openId]

  if (open !== undefined) {
    if (conversation !== undefined) {
      return (
        <MobileConversation
          title={open.displayTitle}
          onBack={() => { setOpenId(undefined) }}
          snapshot={conversation}
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
          <h1>{open.displayTitle}</h1>
        </header>
        <p className={css.summary}>{locale === 'zh' ? '尚未加载此 Session 的对话。' : 'This Session conversation is not loaded.'}</p>
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
      {groups.map(group => (
        <section key={group.key} className={css.group} aria-label={group.label}>
          <h2>{group.workspaceId === undefined ? tw('group.ungrouped') : group.label}</h2>
          {onCreate !== undefined && group.workspaceId !== undefined && (
            <button type="button" disabled={!canMutate} onClick={() => {
              if (canMutate && group.workspaceId !== undefined) onCreate({ workspace: group.workspaceId })
            }}>
              {locale === 'zh' ? `在 ${group.label} 新建 Session` : `New Session in ${group.label}`}
            </button>
          )}
          <SessionListPresentation
            nodes={group.sessions}
            currentId={openId}
            now={now}
            onOpen={setOpenId}
            t={tw}
          />
        </section>
      ))}
      {paged.spilled > 0 && (
        <button type="button" className={css.more} onClick={() => { setPage(current => current + 1) }}>
          {locale === 'zh' ? `加载更多（还有 ${paged.spilled}）` : `Load more (${paged.spilled} remaining)`}
        </button>
      )}
    </section>
  )
}
