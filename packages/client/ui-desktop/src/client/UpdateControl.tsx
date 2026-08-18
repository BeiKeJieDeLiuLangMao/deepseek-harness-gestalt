/** Update Control: same foot row as Settings, talks only to window.dshDesktop. */
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopBridge, UpdaterPhase, UpdaterStatus } from '../protocol.ts'
import css from './UpdateControl.module.css'

/** Injected live updater snapshot. */
export type UpdateControlInjected = {
  hooks: {
    updater: {
      getSnapshot: () => UpdaterStatus
      subscribe: (listener: () => void) => () => void
    }
  }
}

/** Footer-action props plus desktop copy and the updater hook. */
export type UpdateControlProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'desktop'>
  & {
    useUpdater: SnapshotSelectorHook<UpdaterStatus>
  }

/**
 * Render the Update Control.
 * @param props - composed slot props.
 * @returns the actionable control, a hidden state marker while inactive, or null without the Desktop bridge.
 */
export function UpdateControl({ wide, t, useUpdater }: UpdateControlProps) {
  const desktop = window.dshDesktop
  if (desktop === undefined) return null
  const status = useUpdater(snapshot => snapshot)
  if (!isVisible(status)) return <span hidden data-desktop-updater-state={status.state} />
  const label = labelOf(status, t)
  const onClick = () => { applyUpdaterClick(status.state, desktop) }
  return (
    <button
      type="button"
      className={wide ? css.wide : css.rail}
      data-desktop-update-control=""
      aria-label={label}
      title={status.state === 'error' ? status.errorMessage : undefined}
      disabled={
        status.state === 'downloading'
        || status.state === 'preparing'
        || status.state === 'installing'
      }
      onClick={onClick}
    >
      <span className={css.dot} data-state={status.state} />
      {wide && <span className={css.label}>{label}</span>}
    </button>
  )
}

/**
 * Apply one Update Control click to the Desktop bridge.
 * @param state - current updater phase.
 * @param desktop - preload bridge.
 */
export function applyUpdaterClick(state: UpdaterPhase, desktop: DesktopBridge): void {
  switch (state) {
    case 'available':
      desktop.downloadNow()
      return
    case 'downloaded':
      desktop.quitAndInstall()
      return
    case 'idle':
    case 'error':
    case 'disabled':
      desktop.checkNow()
      return
    case 'checking':
    case 'downloading':
    case 'preparing':
    case 'installing':
      return
  }
}

type VisibleUpdaterPhase = Exclude<UpdaterPhase, 'disabled' | 'idle' | 'checking'>

function formatDownloadPercent(percent: number | undefined): string {
  if (percent === undefined || !Number.isFinite(percent)) return '0'
  return String(Math.max(0, Math.min(100, Math.trunc(percent))))
}

function isVisible(status: UpdaterStatus): status is UpdaterStatus & { state: VisibleUpdaterPhase } {
  switch (status.state) {
    case 'available':
    case 'downloading':
    case 'preparing':
    case 'downloaded':
    case 'installing':
      return true
    case 'error':
      return status.newVersion !== undefined
    case 'disabled':
    case 'idle':
    case 'checking':
      return false
  }
}

function labelOf(status: UpdaterStatus & { state: VisibleUpdaterPhase }, t: UpdateControlProps['t']): string {
  switch (status.state) {
    case 'available':
      return t('update.available').replace('{version}', status.newVersion ?? '')
    case 'downloading':
      return t('update.downloading').replace('{percent}', formatDownloadPercent(status.downloadPercent))
    case 'preparing':
      return t('update.preparing')
    case 'downloaded':
    case 'installing':
      return t('update.install')
    case 'error':
      return t('update.error')
    /* v8 ignore next -- closed UpdaterPhase union */
    default: {
      const _exhaustive: never = status.state
      return _exhaustive
    }
  }
}
