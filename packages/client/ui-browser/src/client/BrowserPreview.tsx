/**
 * Collapsed Browser Dock preview: bare offset tab layers in the message
 * region, with no outer shell or footer. Hidden while the Dock is visible.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserWorkspaceProjection } from '@deepseek-ai/dsh-browser-workspace/client'
import type { BrowserPreviewActions } from './slots.ts'
import {
  browserAddressHost, browserTabTitle, hasBrowserTabs, screenshotDataUrl, selectBrowserDock,
  stackedBrowserTabs,
} from './model.ts'
import { useBrowserPage } from './use-browser-page.ts'
import css from './BrowserPreview.module.css'

/** Complete preview-slot props. */
export type BrowserPreviewProps =
  PropsRuntime<'conversation.browser.preview'>
  & PropsLocale<'browser'>
  & BrowserPreviewActions

/**
 * Layered tab preview shown while this Session owns Browser tabs and the Dock
 * is collapsed. A back layer selects that tab; the current layer opens the Dock.
 */
export function BrowserPreview({
  useProjection, openDock, focus, observe, screenshot, t,
}: BrowserPreviewProps) {
  const snapshot = useProjection('browserWorkspace') as BrowserWorkspaceProjection | null | undefined
  const selection = selectBrowserDock(snapshot)
  const active = selection?.activeTab
  const { page, screenshot: shot } = useBrowserPage(active?.target, observe, screenshot)

  if (!hasBrowserTabs(snapshot) || snapshot?.dockOpen === true || selection === undefined) return null

  const layers = stackedBrowserTabs(selection.tabs)
  const title = browserTabTitle(page, t('page.untitled'))
  const address = page === undefined ? '' : browserAddressHost(page.url)
  const image = screenshotDataUrl(shot)
  const currentCaption = address === '' ? title : `${title} · ${address}`

  return (
    <div className={css.stack} data-browser-preview="">
      {layers.map((tab, index) => {
        const current = tab.active
        return (
          <button
            key={tab.target.tabId}
            type="button"
            className={css.layer}
            data-active={current || undefined}
            style={{ zIndex: index }}
            aria-label={current ? t('preview.open', { title }) : t('preview.select', { title })}
            onClick={() => {
              if (current) {
                void openDock()
                return
              }
              /* v8 ignore next -- a back layer is inert until the current page has a revision. */
              if (page === undefined) return
              void focus(tab.target, page.revision)
            }}
          >
            {image !== undefined && <img className={css.shot} src={image} alt="" />}
            <span className={css.caption}>{current ? currentCaption : t('page.untitled')}</span>
          </button>
        )
      })}
    </div>
  )
}
