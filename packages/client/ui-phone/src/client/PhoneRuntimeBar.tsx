/** Shared managed-mobilecli row above the Android and iOS preparation sections. */

import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PhoneManagedRuntimeView } from './phone-runtime-source.ts'
import css from './PhoneRuntimeBar.module.css'

/** Props for the shared phone runtime row. */
export interface PhoneRuntimeBarProps {
  readonly t: PropsLocale<'settings.phone-devices'>['t']
  readonly runtime: PhoneManagedRuntimeView
  readonly onPrepare: () => void
  readonly onCancel: () => void
  readonly onRefresh: () => void
}

/** Render source, version, download size, progress, and the current operation. */
export function PhoneRuntimeBar(props: PhoneRuntimeBarProps): ReactNode {
  const runtime = props.runtime
  const busy = runtime.kind === 'downloading' || runtime.kind === 'verifying' || runtime.kind === 'activating'
  return (
    <article className={css.bar} data-phone-runtime={runtime.kind}>
      <div className={css.copy}>
        <strong>{props.t('runtime.title')}</strong>
        <span>{detail(runtime, props.t)}</span>
        <small>{props.t('runtime.source')}</small>
      </div>
      {runtime.kind === 'downloading' && (
        <progress max={runtime.totalBytes} value={runtime.receivedBytes} aria-label={props.t('runtime.progress')} />
      )}
      {busy
        ? <Button variant="outline" onClick={props.onCancel}>{props.t('common.cancel')}</Button>
        : runtime.kind === 'ready'
          ? <Button variant="outline" onClick={props.onRefresh}>{props.t('common.redetect')}</Button>
          : <Button variant="primary" onClick={props.onPrepare}>{props.t('runtime.prepare')}</Button>}
    </article>
  )
}

function detail(runtime: PhoneManagedRuntimeView, t: PhoneRuntimeBarProps['t']): string {
  switch (runtime.kind) {
    case 'missing': return t('runtime.missing')
      .replace('{version}', runtime.targetVersion)
      .replace('{size}', runtime.assetBytes === undefined ? '' : ` · ${formatBytes(runtime.assetBytes)}`)
    case 'downloading': return t('runtime.downloading')
      .replace('{received}', formatBytes(runtime.receivedBytes))
      .replace('{total}', formatBytes(runtime.totalBytes))
    case 'verifying': return t('runtime.verifying').replace('{version}', runtime.targetVersion)
    case 'activating': return t('runtime.activating')
      .replace('{version}', runtime.targetVersion)
      .replace('{source}', runtime.source)
    case 'ready': return t('runtime.ready')
      .replace('{version}', runtime.version)
      .replace('{source}', runtime.source)
    case 'failed': return t('runtime.failed').replace('{message}', runtime.message)
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
