/** Auth-file settings dialog: original management-center fields, no secrets. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DesktopAccountPoolAccount, DesktopAccountPoolEditableFields, DesktopAccountPoolFieldPatch,
} from '../../protocol.ts'
import { AccountDialog } from './AccountDialog.tsx'
import { ExcludedModelsPicker, type ExcludedModelOption } from './ExcludedModelsPicker.tsx'
import type { AccountPoolCopy } from './quota-display.ts'
import css from './LoginModal.module.css'
import poolCss from './AccountPool.module.css'

export interface SettingsDialogProps {
  t: AccountPoolCopy
  account: DesktopAccountPoolAccount
  details?: DesktopAccountPoolEditableFields
  models?: readonly ExcludedModelOption[]
  onClose: () => void
  onSave: (name: string, fields: DesktopAccountPoolFieldPatch) => void
}

export function SettingsDialog({ t, account, details, models = [], onClose, onSave }: SettingsDialogProps) {
  const seed = details?.fields
  const [note, setNote] = useState(seed?.note ?? account.note ?? '')
  const [prefix, setPrefix] = useState(seed?.prefix ?? account.prefix ?? '')
  const [proxyUrl, setProxyUrl] = useState(seed?.proxyUrl ?? account.proxyUrl ?? '')
  const [priority, setPriority] = useState(
    seed?.priority === undefined && account.priority === undefined ? '' : String(seed?.priority ?? account.priority),
  )
  const [weight, setWeight] = useState(
    seed?.weight === undefined && account.weight === undefined ? '1' : String(seed?.weight ?? account.weight ?? 1),
  )
  const [disableCooling, setDisableCooling] = useState(seed?.disableCooling ?? account.disableCooling === true)
  const [websockets, setWebsockets] = useState(seed?.websockets ?? account.websockets === true)
  const [excludedExact, setExcludedExact] = useState((seed?.excludedModels ?? account.excludedModels ?? []).filter(item => !item.includes('*')))
  const [excludedWildcards, setExcludedWildcards] = useState((seed?.excludedModels ?? account.excludedModels ?? []).filter(item => item.includes('*')).join('\n'))
  const [headersText, setHeadersText] = useState(JSON.stringify(seed?.headers ?? account.headers ?? {}, undefined, 2))
  const [headersError, setHeadersError] = useState<string | undefined>()
  useEffect(() => {
    if (details === undefined) return
    const next = details.fields
    setNote(next.note ?? '')
    setPrefix(next.prefix ?? '')
    setProxyUrl(next.proxyUrl ?? '')
    setPriority(next.priority === undefined ? '' : String(next.priority))
    setWeight(next.weight === undefined ? '1' : String(next.weight))
    setDisableCooling(next.disableCooling === true)
    setWebsockets(next.websockets === true)
    setExcludedExact((next.excludedModels ?? []).filter(item => !item.includes('*')))
    setExcludedWildcards((next.excludedModels ?? []).filter(item => item.includes('*')).join('\n'))
    setHeadersText(JSON.stringify(next.headers ?? {}, undefined, 2))
  }, [details])
  const preview = details?.info ?? accountInfoPreview(account)
  return (
    <AccountDialog title={t('sub2api.settingsTitle')} description={account.name} closeLabel={t('sub2api.close')} onClose={onClose}>
      <div className={poolCss.settingsBody}>
        <section className={poolCss.settingsSection}>
          <h4>{t('sub2api.settingsInfo')}</h4>
          <pre className={poolCss.jsonPreview}>{JSON.stringify(preview, undefined, 2)}</pre>
        </section>
        <label className={css.fieldLabel} htmlFor="account-pool-prefix">{t('sub2api.fieldPrefix')}</label>
        <input id="account-pool-prefix" className={css.textInput} value={prefix} onChange={(event) => { setPrefix(event.target.value) }} />
        <label className={css.fieldLabel} htmlFor="account-pool-proxy">{t('sub2api.fieldProxy')}</label>
        <input
          id="account-pool-proxy"
          className={css.textInput}
          value={proxyUrl}
          placeholder="socks5://username:password@proxy_ip:port/"
          onChange={(event) => { setProxyUrl(event.target.value) }}
        />
        <label className={css.fieldLabel} htmlFor="account-pool-priority">{t('sub2api.fieldPriority')}</label>
        <input
          id="account-pool-priority"
          className={css.textInput}
          value={priority}
          placeholder={t('sub2api.placeholderPriority')}
          onChange={(event) => { setPriority(event.target.value) }}
        />
        <p className={css.fieldTip}>{t('sub2api.fieldPriorityTip')}</p>
        <label className={css.fieldLabel} htmlFor="account-pool-weight">{t('sub2api.fieldWeight')}</label>
        <input
          id="account-pool-weight"
          className={css.textInput}
          value={weight}
          onChange={(event) => { setWeight(event.target.value) }}
        />
        <p className={css.fieldTip}>{t('sub2api.fieldWeightTip')}</p>
        <label className={poolCss.toggleRow}>
          <input type="checkbox" checked={disableCooling} onChange={(event) => { setDisableCooling(event.target.checked) }} />
          <span>{t('sub2api.fieldCooling')}</span>
        </label>
        <p className={css.fieldTip}>{t('sub2api.fieldCoolingTip')}</p>
        <label className={poolCss.toggleRow}>
          <input type="checkbox" checked={websockets} onChange={(event) => { setWebsockets(event.target.checked) }} />
          <span>{t('sub2api.fieldWebsockets')}</span>
        </label>
        <p className={css.fieldTip}>{t('sub2api.fieldWebsocketsTip')}</p>
        <label className={css.fieldLabel} htmlFor="account-pool-excluded">{t('sub2api.fieldExcluded')}</label>
        <ExcludedModelsPicker t={t} models={models} selected={excludedExact} onChange={(next) => { setExcludedExact([...next]) }} />
        <label className={css.fieldLabel} htmlFor="account-pool-wildcards">{t('sub2api.fieldWildcards')}</label>
        <textarea
          id="account-pool-wildcards"
          className={css.textInput}
          rows={2}
          placeholder={t('sub2api.placeholderWildcards')}
          value={excludedWildcards}
          onChange={(event) => { setExcludedWildcards(event.target.value) }}
        />
        <p className={css.fieldTip}>{t('sub2api.fieldWildcardsTip')}</p>
        <label className={css.fieldLabel} htmlFor="account-pool-headers">{t('sub2api.fieldHeaders')}</label>
        <textarea
          id="account-pool-headers"
          className={css.textInput}
          rows={3}
          value={headersText}
          onChange={(event) => { setHeadersText(event.target.value); setHeadersError(undefined) }}
        />
        <p className={css.fieldTip}>{t('sub2api.fieldHeadersTip')}</p>
        {headersError !== undefined && <p className={css.fieldTip}>{headersError}</p>}
        <label className={css.fieldLabel} htmlFor="account-pool-note">{t('sub2api.fieldNote')}</label>
        <input
          id="account-pool-note"
          className={css.textInput}
          value={note}
          placeholder={t('sub2api.placeholderNote')}
          onChange={(event) => { setNote(event.target.value) }}
        />
        <p className={css.fieldTip}>{t('sub2api.fieldNoteTip')}</p>
      </div>
      <div className={css.footer}>
        <Button variant="ghost" onClick={onClose}>{t('sub2api.close')}</Button>
        <Button variant="ghost" onClick={() => {
          void navigator.clipboard.writeText(JSON.stringify(preview, undefined, 2)).catch(() => {
            // Clipboard can be missing in a sandboxed renderer; INFO remains visible.
          })
        }}>{t('sub2api.copy')}</Button>
        <Button variant="primary" onClick={() => {
          const headers = parseHeaders(headersText)
          if (headers === undefined) {
            setHeadersError(t('sub2api.headersInvalid'))
            return
          }
          const nextPriority = parseOptionalInt(priority)
          const nextWeight = parseOptionalInt(weight)
          onSave(account.name, {
            note,
            prefix,
            proxyUrl,
            ...nextPriority === undefined ? {} : { priority: nextPriority },
            ...nextWeight === undefined ? {} : { weight: nextWeight },
            disableCooling,
            websockets,
            excludedModels: [...excludedExact, ...lines(excludedWildcards)],
            headers,
          })
        }}>{t('sub2api.save')}</Button>
      </div>
    </AccountDialog>
  )
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : undefined
}

function lines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(line => line.length > 0)
}

function parseHeaders(text: string): Record<string, string> | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return {}
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'string') return undefined
      out[key] = value
    }
    return out
  } catch {
    return undefined
  }
}

function accountInfoPreview(account: DesktopAccountPoolAccount): Record<string, string | number | boolean> {
  return {
    account: account.email ?? account.label,
    auth_index: account.authIndex,
    disabled: !account.enabled,
    email: account.email ?? '',
    failed: account.failCount,
    id: account.name,
    success: account.successCount,
    ...account.createdAt === undefined ? {} : { created_at: account.createdAt },
    ...account.prefix === undefined ? {} : { prefix: account.prefix },
    ...account.priority === undefined ? {} : { priority: account.priority },
    ...account.weight === undefined ? {} : { weight: account.weight },
    ...account.note === undefined ? {} : { note: account.note },
    ...account.websockets === undefined ? {} : { websockets: account.websockets },
    ...account.disableCooling === undefined ? {} : { disable_cooling: account.disableCooling },
  }
}
