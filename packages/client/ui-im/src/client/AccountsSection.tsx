/**
 * Settings → IM Accounts: DingTalk DWS and Wangwang credential-reference
 * connection. Secrets leave the form only as a minted credential reference.
 */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Button, Input, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ImGuiFace } from './faces.ts'
import type { ImAccountView, ImPlatformId, WangwangCreds } from './model.ts'
import { wangwangCredError } from './model.ts'
import css from './AccountsSection.module.css'

/** Props bound for the IM Accounts settings section. */
export type AccountsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.im'>
  & InjectFace<ImGuiFace>

function statusTone(account: ImAccountView): 'success' | 'warning' | 'neutral' {
  if (!account.connected) return 'neutral'
  if (account.authState === 'expired') return 'warning'
  if (account.paused) return 'warning'
  return 'success'
}

function statusKey(account: ImAccountView): 'connected' | 'disconnected' | 'expired' | 'paused' {
  if (!account.connected) return 'disconnected'
  if (account.authState === 'expired') return 'expired'
  if (account.paused) return 'paused'
  return 'connected'
}

/**
 * Render the IM Accounts settings page.
 * @param props - locale copy and GUI snapshot callbacks.
 */
export function AccountsSection(props: AccountsSectionProps) {
  const snapshot = props.useGui(state => state)
  const [adding, setAdding] = useState(false)
  return (
    <section className={css.section} data-im-accounts>
      <h2 className={css.heading}>{props.t('accountsTitle')}</h2>
      <p className={css.intro}>{props.t('accountsIntro')}</p>
      {snapshot.accounts.map(account => (
        <div key={account.id} className={css.row} data-account={account.id}>
          <div className={css.rowMain}>
            <div className={css.name}>
              {props.t(account.platform)} · {account.displayName}
            </div>
            <div className={css.sub}>
              {account.credentialRef === undefined
                ? null
                : `${props.t('credentialRef')}: ${account.credentialRef}`}
            </div>
          </div>
          <Tag tone={statusTone(account)}>{props.t(statusKey(account))}</Tag>
          <div className={css.acts}>
            <Switch
              checked={!account.paused}
              label={account.paused ? props.t('resume') : props.t('pause')}
              onChange={(next) => { props.setPaused(account.id, !next) }}
            />
            <Button variant="outline" size="sm" onClick={() => { props.disconnect(account.id) }}>
              {props.t('disconnect')}
            </Button>
          </div>
        </div>
      ))}
      {adding
        ? (
          <AddAccountForm
            t={props.t}
            onCancel={() => { setAdding(false) }}
            onConnect={(platform, displayName, creds) => {
              props.connect(platform, displayName, creds)
              setAdding(false)
            }}
          />
        )
        : (
          <Button variant="outline" onClick={() => { setAdding(true) }}>
            {props.t('addAccount')}
          </Button>
        )}
    </section>
  )
}

function AddAccountForm({ t, onCancel, onConnect }: {
  t: AccountsSectionProps['t']
  onCancel: () => void
  onConnect: (platform: ImPlatformId, displayName: string, creds?: WangwangCreds) => void
}) {
  const [platform, setPlatform] = useState<ImPlatformId | null>(null)
  const [step, setStep] = useState<'pick' | 'form' | 'dws'>('pick')
  const [creds, setCreds] = useState<WangwangCreds>({ endpoint: '', accessKey: '', secretKey: '' })
  const [error, setError] = useState<string | undefined>(undefined)
  if (step === 'pick') {
    return (
      <div className={css.form} data-im-add-account>
        <div className={css.hint}>{t('pickPlatform')}</div>
        <div className={css.pick}>
          <Button variant={platform === 'dingtalk' ? 'primary' : 'outline'} onClick={() => { setPlatform('dingtalk') }}>
            {t('dingtalk')}
          </Button>
          <Button variant={platform === 'wangwang' ? 'primary' : 'outline'} onClick={() => { setPlatform('wangwang') }}>
            {t('wangwang')}
          </Button>
        </div>
        <div className={css.acts}>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button
            variant="primary"
            disabled={platform === null}
            onClick={() => { setStep(platform === 'wangwang' ? 'form' : 'dws') }}
          >
            {t('next')}
          </Button>
        </div>
      </div>
    )
  }
  if (step === 'dws' && platform === 'dingtalk') {
    return (
      <div className={css.form} data-im-dingtalk-dws>
        <div className={css.hint}>{t('connecting')}</div>
        <div className={css.acts}>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" onClick={() => { onConnect('dingtalk', 'DingTalk DWS') }}>
            {t('connect')}
          </Button>
        </div>
      </div>
    )
  }
  const field = (key: keyof WangwangCreds, label: string, secret = false) => (
    <label>
      {t(label as 'endpoint')}
      <Input
        type={secret ? 'password' : 'text'}
        value={creds[key]}
        aria-label={t(label as 'endpoint')}
        onChange={(event) => {
          setCreds({ ...creds, [key]: event.target.value })
          setError(undefined)
        }}
      />
    </label>
  )
  return (
    <div className={css.form} data-im-wangwang-form>
      {field('endpoint', 'endpoint')}
      {field('accessKey', 'accessKey')}
      {field('secretKey', 'secretKey', true)}
      <div className={css.hint}>{t('secretHint')}</div>
      {error !== undefined && <div className={css.error} role="alert">{error}</div>}
      <div className={css.acts}>
        <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
        <Button
          variant="primary"
          onClick={() => {
            const key = wangwangCredError(creds)
            if (key !== undefined) { setError(t(key)); return }
            onConnect('wangwang', creds.accessKey, creds)
          }}
        >
          {t('connect')}
        </Button>
      </div>
    </div>
  )
}
