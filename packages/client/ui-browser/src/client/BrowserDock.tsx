/**
 * Expanded Browser Dock: tab strip, refresh plus address chrome, and the
 * screenshot-plus-text viewport. Live Workspace facts arrive through
 * `useProjection('browserWorkspace')`; the active tab re-observes when its
 * listed revision advances. Verbs are the injected face.
 */
import { useEffect, useRef } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconCloseOutline16, IconPanelLeftOutline16, IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { BrowserWorkspaceProjection } from '@deepseek-ai/dsh-browser-workspace/client'
import type { BrowserDockActions } from './slots.ts'
import {
  browserAddressHost, browserTabTitle, hasBrowserTabs, openPageOf,
  persistentProfileLabel, screenshotDataUrl, selectBrowserDock,
} from './model.ts'
import { useBrowserPage } from './use-browser-page.ts'
import css from './BrowserDock.module.css'

/** Complete details-slot props for the expanded Dock. */
export type BrowserDockProps =
  PropsRuntime<'details'>
  & PropsLocale<'browser'>
  & BrowserDockActions
  & {
    /** Open the details column to the Browser occupant range. */
    openDetails: () => void
    /** Write the open details width without changing the occupant range. */
    setDetailsWidth: (px: number) => void
    /** Close the details column. */
    closeDetails: () => void
  }

/**
 * Occupant of `details` while this Session owns Browser tabs and the Dock is
 * open. Restores per-Session visibility and width; collapse persists
 * `userCollapsed` so later Agent activity cannot steal the Dock open.
 */
export function BrowserDock({
  useProjection, setDock, focus, refresh, observe, screenshot, takeover, returnControl, close,
  openDetails, setDetailsWidth, closeDetails, t,
}: BrowserDockProps) {
  const snapshot = useProjection('browserWorkspace') as BrowserWorkspaceProjection | null | undefined
  const selection = selectBrowserDock(snapshot)
  const active = selection?.activeTab
  const { page, screenshot: shot } = useBrowserPage(
    active?.target, observe, screenshot, active?.revision,
  )
  const persistWidth = useRef<number | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hasBrowserTabs(snapshot) || snapshot?.dockOpen !== true) return
    openDetails()
    setDetailsWidth(snapshot.dockWidth)
  }, [openDetails, setDetailsWidth, snapshot?.dockOpen, snapshot?.dockWidth, snapshot?.workspaces.length])

  useEffect(() => {
    const el = rootRef.current
    if (el === null || snapshot?.dockOpen !== true) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      const width = Math.round(el.getBoundingClientRect().width)
      /* v8 ignore next -- a zero-width details column is not painted while dockOpen. */
      if (width < 1) return
      persistWidth.current = width
      clearTimeout(timer)
      timer = setTimeout(() => { void setDock(true, width) }, 300)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [setDock, snapshot?.dockOpen])

  if (!hasBrowserTabs(snapshot) || snapshot?.dockOpen !== true || selection === undefined) return null

  const title = browserTabTitle(page, t('page.untitled'))
  const profile = persistentProfileLabel(page)
  const address = page === undefined ? '' : browserAddressHost(page.url)
  const image = screenshotDataUrl(shot)

  return (
    <div ref={rootRef} className={css.root} data-browser-dock="">
      <div className={css.tabs} role="tablist">
        {selection.tabs.map(tab => (
          <button
            key={tab.target.tabId}
            type="button"
            role="tab"
            className={css.tab}
            data-active={tab.active || undefined}
            aria-selected={tab.active}
            onClick={() => {
              void focus(tab.target, tab.revision)
            }}
          >
            <span className={css.tabTitle}>
              {tab.active ? title : t('page.untitled')}
            </span>
            <span
              className={css.tabClose}
              role="button"
              aria-label={t('dock.closeTab')}
              onClick={(event) => {
                event.stopPropagation()
                void close(tab.target, tab.revision)
              }}
            >
              <IconCloseOutline16 size={12} />
            </span>
          </button>
        ))}
        <button
          type="button"
          className={css.collapse}
          aria-label={t('dock.collapse')}
          onClick={() => {
            const width = persistWidth.current ?? snapshot.dockWidth
            void setDock(false, width)
            closeDetails()
          }}
        >
          <IconPanelLeftOutline16 />
        </button>
      </div>
      <div className={css.toolbar}>
        <button
          type="button"
          className={css.tool}
          aria-label={t('dock.refresh')}
          disabled={page === undefined}
          onClick={() => {
            /* v8 ignore next -- the button is disabled until observe returns an open page. */
            if (page === undefined || active === undefined) return
            const target = active.target
            void (async () => {
              try {
                const current = openPageOf(await observe(target))
                if (current === undefined) return
                await refresh(target, current.revision, current.url)
              } catch {
                // Observe/refresh can reject when the Session binding dropped
                // or the Runtime closed the tab; occupancy stays on the last
                // committed chrome until the listing revision changes.
              }
            })()
          }}
        >
          <IconRefreshOutline16 />
        </button>
        <label className={css.address}>
          {profile !== undefined && <span className={css.profile}>{profile}</span>}
          <input className={css.url} value={address} readOnly aria-label={t('dock.address')} />
        </label>
        {page !== undefined && active !== undefined && (
          <button
            type="button"
            className={css.tool}
            aria-label={page.controlOwner === 'human' ? t('dock.return') : t('dock.takeover')}
            onClick={() => {
              if (page.controlOwner === 'human') void returnControl(active.target, page.revision)
              else void takeover(active.target, page.revision)
            }}
          >
            {page.controlOwner === 'human' ? t('dock.return') : t('dock.takeover')}
          </button>
        )}
      </div>
      <div className={css.viewport}>
        {image === undefined
          ? <div className={css.empty}>{t('dock.empty')}</div>
          : <img className={css.screenshot} src={image} alt={title} />}
        {page !== undefined && page.text !== '' && <div className={css.text}>{page.text}</div>}
      </div>
    </div>
  )
}
