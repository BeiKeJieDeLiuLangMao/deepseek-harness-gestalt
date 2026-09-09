/**
 * Modal dialog for creating an account via CLIProxyAPI login flow.
 * Accurately distinguishes the five OAuth providers (Kimi, Codex, Anthropic, Antigravity, xAI)
 * from the 'GLM Coding Plan' API-key/endpoint subscription form (fixture mode, no real key saved).
 *
 * Specific OAuth mechanisms & endpoints for each vendor remain pending official manager verification;
 * presented strictly as UI fixtures without fabricating unverified product endpoints or plan tiers.
 */

import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProviderType } from './mock-data.ts'
import css from './LoginModal.module.css'

export interface LoginModalProps {
  initialProvider?: ProviderType | undefined
  onClose: () => void
  onSuccess: (newAccount: { provider: ProviderType; email: string; tier?: string | undefined }) => void
}

export function LoginModal({ initialProvider = 'codex', onClose, onSuccess }: LoginModalProps) {
  const [provider, setProvider] = useState<ProviderType>(initialProvider)
  const [step, setStep] = useState<'select' | 'authorizing' | 'apiKeyForm' | 'success' | 'failed'>('select')
  const [authUrl] = useState('https://auth.openai.com/oauth/authorize?response_type=code&client_id=cliproxy...')
  const [deviceCode] = useState('ABCD-EFGH')

  // GLM Coding Plan fixture form state (no hardcoded unverified tiers or real endpoints)
  const [glmApiKey, setGlmApiKey] = useState('')
  const [glmEndpoint, setGlmEndpoint] = useState('')

  const isGlm = provider === 'glm'

  const handleStart = () => {
    if (isGlm) {
      setStep('apiKeyForm')
    } else {
      setStep('authorizing')
      // Simulate OAuth polling result
      setTimeout(() => {
        setStep('success')
      }, 2400)
    }
  }

  const handleGlmSubmit = () => {
    setStep('success')
  }

  const handleFinish = () => {
    onSuccess({
      provider,
      email: isGlm ? 'glm-coding-plan@user-domain.cn' : `new-${provider}-user@domain.com`,
      tier: isGlm ? 'Coding Plan' : undefined,
    })
    onClose()
  }

  return (
    <div className={css.backdrop} onClick={onClose}>
      <div className={css.dialog} onClick={e => { e.stopPropagation() }}>
        <header className={css.header}>
          <div className={css.headerTitle}>
            <h3>添加账号凭证 · CLIProxyAPI</h3>
            <p>选择认证类型并通过 CLIProxyAPI 原生流程完成快速授权或凭据接入。</p>
          </div>
          <button type="button" className={css.closeBtn} onClick={onClose}>✕</button>
        </header>

        <div className={css.body}>
          {step === 'select' && (
            <div className={css.providerList}>
              <label className={css.label}>选择平台认证类型（五家 OAuth 与 GLM 订阅）：</label>
              <div className={css.grid}>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'kimi' ? css.selected : ''}`}
                  onClick={() => { setProvider('kimi') }}
                >
                  <span className={css.providerIcon}>K</span>
                  <strong>Kimi OAuth</strong>
                  <span>设备授权登录 (流程待 manager 源码核验)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'codex' ? css.selected : ''}`}
                  onClick={() => { setProvider('codex') }}
                >
                  <span className={css.providerIcon}>⚡</span>
                  <strong>Codex OAuth</strong>
                  <span>网页 OAuth 登录 (流程待 manager 源码核验)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'anthropic' ? css.selected : ''}`}
                  onClick={() => { setProvider('anthropic') }}
                >
                  <span className={css.providerIcon}>✳</span>
                  <strong>Anthropic OAuth</strong>
                  <span>网页 OAuth 登录 (流程待 manager 源码核验)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'antigravity' ? css.selected : ''}`}
                  onClick={() => { setProvider('antigravity') }}
                >
                  <span className={css.providerIcon}>▲</span>
                  <strong>Antigravity OAuth</strong>
                  <span>Google 快捷授权 (流程待 manager 源码核验)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'xai' ? css.selected : ''}`}
                  onClick={() => { setProvider('xai') }}
                >
                  <span className={css.providerIcon}>Ø</span>
                  <strong>xAI Grok OAuth</strong>
                  <span>OAuth 授权流程 (流程待 manager 源码核验)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'glm' ? css.selected : ''} ${css.glmCard}`}
                  onClick={() => { setProvider('glm') }}
                >
                  <span className={css.providerIcon}>◈</span>
                  <strong>GLM Coding Plan</strong>
                  <span>订阅专用 API Key 表单接入 (非 OAuth 网页回调)</span>
                </button>
              </div>
            </div>
          )}

          {step === 'authorizing' && (
            <div className={css.authStep}>
              <div className={css.spinner} />
              <h4>正在等待 {provider.toUpperCase()} OAuth 流程完成…</h4>
              <p>请在系统浏览器中完成授权页面操作：</p>
              <div className={css.urlBox}>{authUrl}</div>
              {provider === 'kimi' && (
                <div className={css.deviceCodeBox}>
                  <span>设备授权码：</span>
                  <strong>{deviceCode}</strong>
                </div>
              )}
              <span className={css.hint}>
                CLIProxyAPI 本地回调服务正在监听授权返回（具体流程待 manager 上游事实核验）
              </span>
            </div>
          )}

          {step === 'apiKeyForm' && (
            <div className={css.formStep}>
              <div className={css.formBadge}>Sub2API Coding Plan 订阅模式</div>
              <h4 className={css.formTitle}>输入智谱 GLM Coding 订阅凭据</h4>
              <p className={css.formDesc}>
                基于 Sub2API 移植实现，GLM 订阅采用专属 API Key 与 Coding 端点，无需 OAuth 网页回调。
              </p>

              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>订阅专用 API Key：</label>
                <input
                  type="text"
                  className={css.textInput}
                  value={glmApiKey}
                  onChange={e => { setGlmApiKey(e.target.value) }}
                  placeholder="请输入 GLM Coding 订阅专属 API Key (原型演示不保存真实密钥)"
                />
                <span className={css.fieldTip}>原型演示环境为内存 Mock，不持久化或外传任何密钥。</span>
              </div>

              <div className={css.fieldGroup}>
                <label className={css.fieldLabel}>Coding 专属网关端点：</label>
                <input
                  type="text"
                  className={css.textInput}
                  value={glmEndpoint}
                  onChange={e => { setGlmEndpoint(e.target.value) }}
                  placeholder="订阅端点待独立调查确定，留空使用核心默认"
                />
                <span className={css.fieldTip}>
                  端点地址待 Sub2API 来源事实核验给出，不预置未经证实的普通通用 API 地址。
                </span>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className={css.resultStep}>
              <div className={css.successIcon}>✓</div>
              <h4>{isGlm ? 'GLM 订阅凭据配置就绪！' : 'OAuth 授权成功并已保存认证文件！'}</h4>
              <p>
                {isGlm
                  ? '已接入 GLM Coding Plan 订阅路由，模型目录就绪（具体参数由移植调查确定）。'
                  : '账号凭证已由 CLIProxyAPI 加密暂存，模型目录已就绪。'}
              </p>
            </div>
          )}
        </div>

        <footer className={css.footer}>
          {step === 'select' && (
            <>
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button variant="primary" onClick={handleStart}>
                {isGlm ? '配置 GLM 订阅凭据' : `开始 ${provider.toUpperCase()} 登录`}
              </Button>
            </>
          )}
          {step === 'authorizing' && (
            <Button variant="outline" onClick={() => { setStep('select') }}>返回选择</Button>
          )}
          {step === 'apiKeyForm' && (
            <>
              <Button variant="ghost" onClick={() => { setStep('select') }}>返回</Button>
              <Button variant="primary" onClick={handleGlmSubmit}>保存并接入账号池</Button>
            </>
          )}
          {step === 'success' && (
            <Button variant="primary" onClick={handleFinish}>完成并进入账号池</Button>
          )}
        </footer>
      </div>
    </div>
  )
}
