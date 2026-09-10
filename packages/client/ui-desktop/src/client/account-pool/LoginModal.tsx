/** Login dialog: device, PKCE, or GLM Coding Plan key. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountPoolLoginKind, AccountPoolLoginStart } from '../../protocol.ts'
import css from './LoginModal.module.css'

export interface LoginModalProps {
  initialProvider: AccountPoolLoginKind
  login?: AccountPoolLoginStart
  onClose: () => void
  onStart: (kind: AccountPoolLoginKind) => void
  onCancel: (state: string) => void
  onSubmitGlmKey: (input: { apiKey: string; site: 'cn' | 'international'; organization?: string; project?: string }) => void
}

export function LoginModal({ initialProvider, login, onClose, onStart, onCancel, onSubmitGlmKey }: LoginModalProps) {
  const [provider, setProvider] = useState<AccountPoolLoginKind>(initialProvider)
  const [glmApiKey, setGlmApiKey] = useState('')
  const [glmSite, setGlmSite] = useState<'cn' | 'international'>('cn')
  const [organization, setOrganization] = useState('')
  const [project, setProject] = useState('')
  const isGlm = provider === 'glm'
  const isDevice = provider === 'kimi' || provider === 'xai'
  const step = login === undefined ? (isGlm ? 'apiKeyForm' : 'select') : login.error !== undefined ? 'failed' : login.flow === 'glm-key' ? 'apiKeyForm' : 'authorizing'

  useEffect(() => { setProvider(initialProvider) }, [initialProvider])

  return (
    <div className={css.backdrop} onClick={onClose}>
      <div className={css.dialog} onClick={(event) => { event.stopPropagation() }}>
        <header className={css.header}>
          <div className={css.headerTitle}>
            <h3>添加账号凭证</h3>
            <p>Kimi/xAI 设备授权，Codex/Anthropic/Antigravity PKCE，GLM Coding Plan 密钥。</p>
          </div>
          <button type="button" className={css.closeBtn} onClick={onClose}>✕</button>
        </header>
        <div className={css.body}>
          {step === 'select' && (
            <div className={css.providerList}>
              <label className={css.label}>选择平台认证类型：</label>
              <div className={css.grid}>
                {(['kimi', 'xai', 'codex', 'anthropic', 'antigravity', 'glm'] as const).map(kind => (
                  <button key={kind} type="button" className={`${css.providerCard} ${provider === kind ? css.selected : ''}`} onClick={() => { setProvider(kind) }}>
                    <strong>{kind.toUpperCase()}</strong>
                    <span>{kind === 'glm' ? 'Coding Plan 密钥' : kind === 'kimi' || kind === 'xai' ? '设备授权' : 'PKCE 重定向'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 'authorizing' && login !== undefined && (
            <div className={css.authStep}>
              <div className={css.spinner} />
              <h4>正在等待 {provider.toUpperCase()} {isDevice ? '设备授权' : '浏览器授权'}…</h4>
              {login.url !== undefined && <div className={css.urlBox}>{login.url}</div>}
              {login.userCode !== undefined && (
                <div className={css.deviceCodeBox}><span>设备用户码：</span><strong>{login.userCode}</strong></div>
              )}
            </div>
          )}
          {step === 'apiKeyForm' && (
            <div className={css.formStep}>
              <div className={css.formBadge}>GLM Coding Plan</div>
              <h4 className={css.formTitle}>输入智谱 GLM Coding 订阅凭据</h4>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>订阅专用 API Key：</label>
                <input type="password" className={css.textInput} value={glmApiKey} onChange={(event) => { setGlmApiKey(event.target.value) }} autoComplete="off" />
              </div>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>站点：</label>
                <select className={css.textInput} value={glmSite} onChange={(event) => { setGlmSite(event.target.value as 'cn' | 'international') }}>
                  <option value="cn">open.bigmodel.cn</option>
                  <option value="international">api.z.ai</option>
                </select>
              </div>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>团队 organization（可选）：</label>
                <input className={css.textInput} value={organization} onChange={(event) => { setOrganization(event.target.value) }} />
              </div>
              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>项目 project（可选）：</label>
                <input className={css.textInput} value={project} onChange={(event) => { setProject(event.target.value) }} />
              </div>
            </div>
          )}
          {step === 'failed' && <div className={css.resultStep}><h4>{login?.error ?? '登录失败'}</h4></div>}
        </div>
        <footer className={css.footer}>
          {step === 'select' && (
            <>
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button variant="primary" onClick={() => { if (isGlm) setProvider('glm'); else onStart(provider) }}>
                {isGlm ? '配置 GLM 订阅凭据' : `开始 ${provider.toUpperCase()} 登录`}
              </Button>
            </>
          )}
          {step === 'authorizing' && login?.state !== undefined && (
            <Button variant="outline" onClick={() => { onCancel(login.state ?? '') }}>取消</Button>
          )}
          {step === 'apiKeyForm' && (
            <>
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button variant="primary" onClick={() => {
                onSubmitGlmKey({
                  apiKey: glmApiKey,
                  site: glmSite,
                  ...organization.trim().length === 0 ? {} : { organization: organization.trim() },
                  ...project.trim().length === 0 ? {} : { project: project.trim() },
                })
              }}>保存并接入账号池</Button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
