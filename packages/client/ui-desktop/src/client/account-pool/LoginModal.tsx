/** Login dialog: device, PKCE, or GLM Coding Plan key. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountPoolLoginKind, AccountPoolLoginStart } from '../../protocol.ts'
import css from './LoginModal.module.css'

type DesktopCopy = PropsLocale<'desktop'>['t']

export interface LoginModalProps {
  t: DesktopCopy
  initialProvider: AccountPoolLoginKind
  login?: AccountPoolLoginStart
  onClose: () => void
  onStart: (kind: AccountPoolLoginKind) => void
  onCancel: (state: string) => void
  onSubmitGlmKey: (input: { apiKey: string; site: 'cn' | 'international'; organization?: string; project?: string }) => void
}

export function LoginModal({ t, initialProvider, login, onClose, onStart, onCancel, onSubmitGlmKey }: LoginModalProps) {
  const [provider, setProvider] = useState<AccountPoolLoginKind>(initialProvider)
  const [glmApiKey, setGlmApiKey] = useState('')
  const [glmSite, setGlmSite] = useState<'cn' | 'international'>('cn')
  const [organization, setOrganization] = useState('')
  const [project, setProject] = useState('')
  const isGlm = provider === 'glm'
  const isDevice = provider === 'kimi' || provider === 'xai'
  const step = login === undefined ? (isGlm ? 'apiKeyForm' : 'select') : login.error !== undefined ? 'failed' : login.flow === 'glm-key' ? 'apiKeyForm' : 'authorizing'
  const cancelState = login?.state

  useEffect(() => { setProvider(initialProvider) }, [initialProvider])

  return (
    <div className={css.backdrop} onClick={onClose}>
      <div className={css.dialog} onClick={(event) => { event.stopPropagation() }}>
        <header className={css.header}>
          <div className={css.headerTitle}>
            <h3>{t('pool.login.title')}</h3>
            <p>{t('pool.login.intro')}</p>
          </div>
          <button type="button" className={css.closeBtn} onClick={onClose}>✕</button>
        </header>
        <div className={css.body}>
          {step === 'select' && (
            <div className={css.providerList}>
              <label className={css.label}>{t('pool.login.choose')}</label>
              <div className={css.grid}>
                {(['kimi', 'xai', 'codex', 'anthropic', 'antigravity', 'glm'] as const).map(kind => (
                  <button key={kind} type="button" className={`${css.providerCard} ${provider === kind ? css.selected : ''}`} onClick={() => { setProvider(kind) }}>
                    <strong>{kind.toUpperCase()}</strong>
                    <span>{kind === 'glm' ? t('pool.login.glm') : kind === 'kimi' || kind === 'xai' ? t('pool.login.device') : t('pool.login.pkce')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 'authorizing' && login !== undefined && (
            <div className={css.authStep}>
              <div className={css.spinner} />
              <h4>{t('pool.login.waiting').replace('{provider}', provider.toUpperCase()).replace('{kind}', isDevice ? t('pool.login.device') : t('pool.login.browser'))}</h4>
              {login.url !== undefined && <div className={css.urlBox}>{login.url}</div>}
              {login.userCode !== undefined && (
                <div className={css.deviceCodeBox}><span>{t('pool.login.userCode')}</span><strong>{login.userCode}</strong></div>
              )}
            </div>
          )}
          {step === 'apiKeyForm' && (
            <div className={css.formStep}>
              <div className={css.formBadge}>{t('pool.login.glmBadge')}</div>
              <h4 className={css.formTitle}>{t('pool.login.glmTitle')}</h4>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>{t('pool.login.apiKey')}</label>
                <input type="password" className={css.textInput} value={glmApiKey} onChange={(event) => { setGlmApiKey(event.target.value) }} autoComplete="off" />
              </div>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>{t('pool.login.site')}</label>
                <select className={css.textInput} value={glmSite} onChange={(event) => { setGlmSite(event.target.value as 'cn' | 'international') }}>
                  <option value="cn">open.bigmodel.cn</option>
                  <option value="international">api.z.ai</option>
                </select>
              </div>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>{t('pool.login.organization')}</label>
                <input className={css.textInput} value={organization} onChange={(event) => { setOrganization(event.target.value) }} />
              </div>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>{t('pool.login.project')}</label>
                <input className={css.textInput} value={project} onChange={(event) => { setProject(event.target.value) }} />
              </div>
            </div>
          )}
          {step === 'failed' && login !== undefined && <div className={css.resultStep}><h4>{login.error}</h4></div>}
        </div>
        <footer className={css.footer}>
          {step === 'select' && (
            <>
              <Button variant="ghost" onClick={onClose}>{t('sub2api.cancel')}</Button>
              <Button variant="primary" onClick={() => { onStart(provider) }}>
                {t('pool.login.start').replace('{provider}', provider.toUpperCase())}
              </Button>
            </>
          )}
          {step === 'authorizing' && cancelState !== undefined && (
            <Button variant="outline" onClick={() => { onCancel(cancelState) }}>{t('sub2api.cancel')}</Button>
          )}
          {step === 'apiKeyForm' && (
            <>
              <Button variant="ghost" onClick={onClose}>{t('sub2api.cancel')}</Button>
              <Button variant="primary" onClick={() => {
                onSubmitGlmKey({
                  apiKey: glmApiKey,
                  site: glmSite,
                  ...organization.trim().length === 0 ? {} : { organization: organization.trim() },
                  ...project.trim().length === 0 ? {} : { project: project.trim() },
                })
              }}>{t('pool.login.save')}</Button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
