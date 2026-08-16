/** Desktop-only window drag region and Windows caption buttons. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DragStrip.module.css'

/** Drag-strip props: column state plus desktop copy. */
export type DragStripProps = PropsRuntime<'sidebar.chrome.drag'> & PropsLocale<'desktop'>

/**
 * Render the drag region. Windows paints caption buttons on the right.
 * @param props - composed slot props.
 * @returns the drag strip.
 */
export function DragStrip({ t }: DragStripProps) {
  const desktop = window.dshDesktop
  const windows = desktop?.platform === 'win32'
  const mac = desktop?.platform === 'darwin'
  if (!windows && !mac) return null
  return (
    <div
      className={windows ? css.strip : css.macChrome}
      data-desktop-chrome={windows ? 'win' : 'mac'}
    >
      <div className={css.drag} />
      {windows && (
        <div className={css.captions}>
          <button type="button" className={css.caption} aria-label={t('window.minimize')} onClick={() => { desktop.windowMinimize() }}>–</button>
          <button type="button" className={css.caption} aria-label={t('window.maximize')} onClick={() => { desktop.windowMaximize() }}>□</button>
          <button type="button" className={css.caption} aria-label={t('window.close')} onClick={() => { desktop.windowClose() }}>×</button>
        </div>
      )}
    </div>
  )
}
