/**
 * The workspace-fence refusal surface. The raw wire text (`path "..." is
 * outside workspace`) is never shown as-is: the editor / file-tree error
 * slots render the localized reason plus a one-click global off — the click
 * flips the `workspaceFence` preference through the injected writer and calls
 * `onDisabled` so the caller retries the failed operation immediately.
 */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { t } from './locales.ts'
import css from './sidebar.module.css'

export function FenceErrorNotice(props: { disable: () => Promise<void>; onDisabled: () => void }) {
  const { disable, onDisabled } = props
  const [busy, setBusy] = useState(false)
  const submit = (): void => {
    if (busy) return
    setBusy(true)
    disable().then(() => {
      onDisabled()
    }).catch((error: unknown) => {
      // The fence stays armed on failure (the notice remains, button
      // re-enabled); the console carries the cause.
      console.error('workspace fence disable failed', error)
      setBusy(false)
    })
  }
  return (
    <div className={css.fenceError}>
      <span>{t('fenceErrorReason')}</span>
      <Button variant="outline" disabled={busy} onClick={submit}>{t('fenceDisableAction')}</Button>
    </div>
  )
}
