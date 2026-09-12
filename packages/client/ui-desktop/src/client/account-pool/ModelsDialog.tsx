/** Supported-models overlay: copyable id, display name, and provider chip. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopAccountPoolModel } from '../../protocol.ts'
import { AccountDialog } from './AccountDialog.tsx'
import type { AccountPoolCopy } from './quota-display.ts'
import css from './ModelsDialog.module.css'
import poolCss from './AccountPool.module.css'

export function ModelsDialog({
  t,
  name,
  models,
  onClose,
}: {
  t: AccountPoolCopy
  name: string
  models: readonly DesktopAccountPoolModel[]
  onClose: () => void
}) {
  const [copied, setCopied] = useState<string | undefined>()
  return (
    <AccountDialog
      title={t('sub2api.modelsTitle', { name })}
      {...models.length === 0 ? {} : { description: t('sub2api.modelsCount', { count: models.length }) }}
      closeLabel={t('sub2api.close')}
      onClose={onClose}
    >
      {models.length === 0 ? (
        <p className={poolCss.dialogEmpty}>{t('sub2api.modelsEmpty')}</p>
      ) : (
        <ul className={css.list} data-testid="account-pool-models-dialog">
          {models.map(model => (
            <li key={model.id}>
              <button
                type="button"
                className={css.row}
                onClick={() => {
                  const clipboard = navigator.clipboard
                  if (clipboard === undefined) return
                  void clipboard.writeText(model.id).then(() => {
                    setCopied(model.id)
                    window.setTimeout(() => { setCopied(current => current === model.id ? undefined : current) }, 1200)
                  }).catch(() => {
                    // Clipboard can be missing in a sandboxed renderer.
                  })
                }}
              >
                <span className={css.id}>{model.id}</span>
                {model.name !== undefined && model.name !== model.id && <span className={css.display}>{model.name}</span>}
                {model.ownedBy !== undefined && <span className={css.owner}>{model.ownedBy}</span>}
                <span className={css.copy}>{copied === model.id ? t('sub2api.copied') : t('sub2api.copy')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={css.footer}>
        <Button variant="ghost" onClick={onClose}>{t('sub2api.close')}</Button>
      </div>
    </AccountDialog>
  )
}
