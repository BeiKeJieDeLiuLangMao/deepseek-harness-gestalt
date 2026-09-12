/**
 * The ways into hidden workbench surfaces in the conversation header's corner
 * seat: the right-surface button appears while that surface is collapsed, and
 * the bottom-surface button remains available in both states.
 *
 * It lives in the conversation's own header rather than in the frame's right
 * column so that a collapsed Sidebar costs the conversation nothing — no rail,
 * no width, and the transcript's scrollbar stays at the column's edge. The
 * corner seat is its own, past the utilities' edge. The right control becomes a
 * same-size placeholder while its surface is shown, so the bottom control does
 * not move. Both controls share the panel's per-session store.
 *
 * The right glyph mirrors the left sidebar's control. The bottom control
 * rotates the same panel glyph so its divider marks the lower edge.
 */
import type { ReactNode } from 'react'
import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createSidebarRightStore } from '../stores.ts'
import css from './ExpandButton.module.css'

/** The button's props: the header corner seat, the shared store, and copy. */
export type ExpandButtonProps =
  & PropsRuntime<'conversation.session.header.corner'>
  & PropsStore<ReturnType<typeof createSidebarRightStore>>
  & PropsLocale<'sidebarRight'>

/** The expand control while the panel is collapsed; its footprint while it is shown. */
export function ExpandButton({ sessionId, useStore, actions, t }: ExpandButtonProps): ReactNode {
  // A session with no surface yet is collapsed: the panel seat materializes the
  // surface on its own mount, and until then there is nothing expanded.
  const expanded = useStore(state => state.bySession[sessionId]?.layout.expanded ?? false)
  const bottomExpanded = useStore(state => state.bySession[sessionId]?.bottom.layout.expanded ?? false)
  return (
    <span className={css.controls}>
      {expanded
        ? <span className={css.placeholder} aria-hidden data-sidebar-right-expand-placeholder />
        : (
          <button
            type="button"
            className={css.button}
            aria-label={t('chrome.expand')}
            title={t('chrome.expand')}
            data-sidebar-right-expand
            onClick={() => { actions.setExpanded(sessionId, true) }}
          >
            <IconPanelLeftOutline16 className={css.icon} />
          </button>
        )}
      <button
        type="button"
        className={css.button}
        aria-label={t(bottomExpanded ? 'chrome.collapseBottom' : 'chrome.expandBottom')}
        title={t(bottomExpanded ? 'chrome.collapseBottom' : 'chrome.expandBottom')}
        data-sidebar-bottom-toggle
        onClick={() => { actions.setSurfaceExpanded(sessionId, 'bottom', !bottomExpanded) }}
      >
        <IconPanelLeftOutline16 className={css.bottomIcon} />
      </button>
    </span>
  )
}
