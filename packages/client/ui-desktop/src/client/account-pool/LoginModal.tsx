/** Login dialog: device, PKCE, or GLM Coding Plan key. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountPoolLoginKind, AccountPoolLoginStart } from '../../protocol.ts'
import { ProviderIcon, providerDisplayName } from './ProviderIcon.tsx'
import type { AccountPoolCopy } from './quota-display.ts'
import css from './LoginModal.module.css'

export interface LoginModalProps {
  t: AccountPoolCopy
  initialProvider: AccountPoolLoginKind
  login?: AccountPoolLoginStart
  onClose: () => void
  onStart: (kind: AccountPoolLoginKind) => void
  onCancel: (state: string) => void
  onOpenExternal: (url: string) => void
  onSubmitCallback: (input: { provider: AccountPoolLoginKind; redirectUrl: string }) => void
  onSubmitGlmKey: (input: { apiKey: string; site: 'cn' | 'international'; organization?: string; project?: string }) => void
}

export function LoginModal({
  t, initialProvider, login, onClose, onStart, onCancel, onOpenExternal, onSubmitCallback, onSubmitGlmKey,
}: LoginModalProps) {
  const [provider, setProvider] = useState<AccountPoolLoginKind>(initialProvider)
  const [glmApiKey, setGlmApiKey] = useState('')
  const [glmSite, setGlmSite] = useState<'cn' | 'international'>('cn')
  const [glmScope, setGlmScope] = useState<'personal' | 'team'>('personal')
  const [organization, setOrganization] = useState('')
  const [project, setProject] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [copied, setCopied] = useState(false)
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
            <h3>{t('sub2api.loginTitle')}</h3>
            <p>{t('sub2api.loginLead')}</p>
          </div>
          <button type="button" className={css.closeBtn} onClick={onClose} aria-label={t('sub2api.close')}>✕</button>
        </header>
        <div className={css.body}>
          {step === 'select' && (
            <div className={css.providerList}>
              <label className={css.label}>{t('sub2api.chooseProvider')}</label>
              <div className={css.grid}>
                {(['kimi', 'xai', 'codex', 'anthropic', 'antigravity', 'glm'] as const).map(kind => (
                  <button key={kind} type="button" className={`${css.providerCard} ${provider === kind ? css.selected : ''}`} data-testid={`provider-card-${kind}`} onClick={() => { setProvider(kind) }}>
                    <span className={css.providerIcon}><ProviderIcon provider={kind} /></span>
                    <strong>{providerDisplayName(kind)}</strong>
                    <span>{kind === 'glm' ? t('sub2api.flowKey') : kind === 'kimi' || kind === 'xai' ? t('sub2api.flowDevice') : t('sub2api.flowPkce')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 'authorizing' && login !== undefined && (
            <div className={css.authStep}>
              <div className={css.spinner} />
              <h4>{t('sub2api.waitingAuth', { provider: provider.toUpperCase(), flow: isDevice ? t('sub2api.flowDevice') : t('sub2api.flowPkce') })}</h4>
              {login.url !== undefined && (
                <>
                  <div className={css.urlBox}>{login.url}</div>
                  <div className={css.linkActions}>
                    <Button variant="ghost" onClick={() => {
                      const url = login.url
                      if (url === undefined) return
                      void navigator.clipboard.writeText(url).then(() => {
                        setCopied(true)
                        window.setTimeout(() => { setCopied(false) }, 1_500)
                      }).catch(() => {
                        // Clipboard can be missing in a sandboxed renderer; the URL remains visible.
                      })
                    }}>{copied ? t('sub2api.copied') : t('sub2api.copyLink')}</Button>
                    <Button variant="primary" onClick={() => { onOpenExternal(login.url ?? '') }}>
                      {t('sub2api.openBrowser')}
                    </Button>
                  </div>
                </>
              )}
              {login.userCode !== undefined && (
                <div className={css.deviceCodeBox}><span>{t('sub2api.deviceCode')}</span><strong>{login.userCode}</strong></div>
              )}
              {!isDevice && (
                <div className={css.callbackBox}>
                  <label className={css.fieldLabel} htmlFor="account-pool-callback-url">{t('sub2api.callbackUrl')}</label>
                  <input
                    id="account-pool-callback-url"
                    className={css.textInput}
                    value={callbackUrl}
                    placeholder="http://localhost:1455/auth/callback?code=…&state=…"
                    onChange={(event) => { setCallbackUrl(event.target.value) }}
                  />
                  <p className={css.fieldTip}>{t('sub2api.callbackTip')}</p>
                  <Button variant="outline" onClick={() => {
                    onSubmitCallback({ provider, redirectUrl: callbackUrl.trim() })
                  }}>{t('sub2api.submitCallback')}</Button>
                </div>
              )}
            </div>
          )}
          {step === 'apiKeyForm' && (
            <div className={css.formStep}>
              <div className={css.formBadge}>{t('sub2api.glmBadge')}</div>
              <h4 className={css.formTitle}>{t('sub2api.glmTitle')}</h4>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel} htmlFor="account-pool-glm-key">{t('sub2api.glmKey')}</label>
                <input id="account-pool-glm-key" type="password" className={css.textInput} value={glmApiKey} onChange={(event) => { setGlmApiKey(event.target.value) }} autoComplete="off" />
              </div>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel} htmlFor="account-pool-glm-site">{t('sub2api.glmSite')}</label>
                <select id="account-pool-glm-site" className={css.textInput} value={glmSite} onChange={(event) => { setGlmSite(event.target.value as 'cn' | 'international') }}>
                  <option value="cn">open.bigmodel.cn</option>
                  <option value="international">api.z.ai</option>
                </select>
              </div>
              <div className={css.fieldGroup}>
                <span className={css.fieldLabel}>{t('sub2api.glmScope')}</span>
                <label className={css.choice}>
                  <input type="radio" name="account-pool-glm-scope" checked={glmScope === 'personal'} onChange={() => { setGlmScope('personal') }} />
                  {t('sub2api.glmPersonal')}
                </label>
                <label className={css.choice}>
                  <input type="radio" name="account-pool-glm-scope" checked={glmScope === 'team'} onChange={() => { setGlmScope('team') }} />
                  {t('sub2api.glmTeam')}
                </label>
              </div>
              {glmScope === 'team' && (
                <>
                  <div className={css.fieldGroup}>
                    <label className={css.fieldLabel} htmlFor="account-pool-glm-org">{t('sub2api.glmOrg')}</label>
                    <input id="account-pool-glm-org" className={css.textInput} value={organization} onChange={(event) => { setOrganization(event.target.value) }} />
                  </div>
                  <div className={css.fieldGroup}>
                    <label className={css.fieldLabel} htmlFor="account-pool-glm-project">{t('sub2api.glmProject')}</label>
                    <input id="account-pool-glm-project" className={css.textInput} value={project} onChange={(event) => { setProject(event.target.value) }} />
                  </div>
                </>
              )}
            </div>
          )}
          {step === 'failed' && login !== undefined && (
            <div className={css.resultStep}><h4>{login.error}</h4></div>
          )}
        </div>
        <footer className={css.footer}>
          {step === 'select' && (
            <>
              <Button variant="ghost" onClick={onClose}>{t('sub2api.cancel')}</Button>
              <Button variant="primary" onClick={() => { onStart(provider) }}>
                {t('sub2api.startLogin', { provider: provider.toUpperCase() })}
              </Button>
            </>
          )}
          {step === 'authorizing' && (
            cancelState === undefined
              ? <Button variant="ghost" onClick={onClose}>{t('sub2api.cancel')}</Button>
              : <Button variant="outline" onClick={() => { onCancel(cancelState) }}>{t('sub2api.cancel')}</Button>
          )}
          {step === 'failed' && (
            <Button variant="primary" onClick={onClose}>{t('sub2api.close')}</Button>
          )}
          {step === 'apiKeyForm' && (
            <>
              <Button variant="ghost" onClick={onClose}>{t('sub2api.cancel')}</Button>
              <Button variant="primary" disabled={glmScope === 'team' && organization.trim().length === 0} onClick={() => {
                if (glmScope === 'team' && organization.trim().length === 0) return
                onSubmitGlmKey({
                  apiKey: glmApiKey,
                  site: glmSite,
                  ...glmScope === 'team' ? { organization: organization.trim() } : {},
                  ...glmScope === 'team' && project.trim().length > 0 ? { project: project.trim() } : {},
                })
              }}>{t('sub2api.glmSave')}</Button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
