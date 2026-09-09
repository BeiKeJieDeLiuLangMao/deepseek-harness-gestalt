/**
 * Modal dialog for creating an account via CLIProxyAPI login flow.
 * Supports Kimi, Codex, Anthropic, Antigravity, xAI, and GLM.
 */

import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProviderType } from './mock-data.ts'
import css from './LoginModal.module.css'

export interface LoginModalProps {
  initialProvider?: ProviderType
  onClose: () => void
  onSuccess: (newAccount: { provider: ProviderType; email: string }) => void
}

export function LoginModal({ initialProvider = 'codex', onClose, onSuccess }: LoginModalProps) {
  const [provider, setProvider] = useState<ProviderType>(initialProvider)
  const [step, setStep] = useState<'select' | 'authorizing' | 'success' | 'failed'>('select')
  const [authUrl] = useState('https://auth.openai.com/oauth/authorize?response_type=code&client_id=cliproxy...')
  const [deviceCode] = useState('ABCD-EFGH')

  const startLogin = () => {
    setStep('authorizing')
    // Simulate async polling result
    setTimeout(() => {
      setStep('success')
    }, 2400)
  }

  const handleFinish = () => {
    onSuccess({
      provider,
      email: `new-${provider}-user@domain.com`,
    })
    onClose()
  }

  return (
    <div className={css.backdrop} onClick={onClose}>
      <div className={css.dialog} onClick={e => { e.stopPropagation() }}>
        <header className={css.header}>
          <div className={css.headerTitle}>
            <h3>添加账号凭证 · CLIProxyAPI</h3>
            <p>选择认证类型并通过 CLIProxyAPI 原生流程完成快速授权。</p>
          </div>
          <button type="button" className={css.closeBtn} onClick={onClose}>✕</button>
        </header>

        <div className={css.body}>
          {step === 'select' && (
            <div className={css.providerList}>
              <label className={css.label}>选择平台认证类型：</label>
              <div className={css.grid}>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'kimi' ? css.selected : ''}`}
                  onClick={() => { setProvider('kimi') }}
                >
                  <span className={css.providerIcon}>K</span>
                  <strong>Kimi OAuth</strong>
                  <span>设备授权快速登录</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'codex' ? css.selected : ''}`}
                  onClick={() => { setProvider('codex') }}
                >
                  <span className={css.providerIcon}>⚡</span>
                  <strong>Codex OAuth</strong>
                  <span>网页 OAuth 流程登录</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'anthropic' ? css.selected : ''}`}
                  onClick={() => { setProvider('anthropic') }}
                >
                  <span className={css.providerIcon}>✳</span>
                  <strong>Anthropic OAuth</strong>
                  <span>Claude 服务凭据</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'antigravity' ? css.selected : ''}`}
                  onClick={() => { setProvider('antigravity') }}
                >
                  <span className={css.providerIcon}>▲</span>
                  <strong>Antigravity OAuth</strong>
                  <span>Google 账号快捷关联</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'xai' ? css.selected : ''}`}
                  onClick={() => { setProvider('xai') }}
                >
                  <span className={css.providerIcon}>Ø</span>
                  <strong>xAI OAuth</strong>
                  <span>Grok 服务认证文件</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'glm' ? css.selected : ''}`}
                  onClick={() => { setProvider('glm') }}
                >
                  <span className={css.providerIcon}>◈</span>
                  <strong>GLM 订阅凭据</strong>
                  <span>Sub2API 移植订阅流</span>
                </button>
              </div>
            </div>
          )}

          {step === 'authorizing' && (
            <div className={css.authStep}>
              <div className={css.spinner} />
              <h4>正在等待 {provider.toUpperCase()} 登录完成…</h4>
              <p>请在系统浏览器中完成授权页面操作：</p>
              <div className={css.urlBox}>{authUrl}</div>
              {provider === 'kimi' && (
                <div className={css.deviceCodeBox}>
                  <span>设备授权码：</span>
                  <strong>{deviceCode}</strong>
                </div>
              )}
              <span className={css.hint}>CLIProxyAPI 本地回调服务正在监听授权返回</span>
            </div>
          )}

          {step === 'success' && (
            <div className={css.resultStep}>
              <div className={css.successIcon}>✓</div>
              <h4>授权成功并已保存认证文件！</h4>
              <p>账号凭证已由 CLIProxyAPI 加密暂存，模型目录已就绪。</p>
            </div>
          )}
        </div>

        <footer className={css.footer}>
          {step === 'select' && (
            <>
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button variant="primary" onClick={startLogin}>开始 {provider.toUpperCase()} 登录</Button>
            </>
          )}
          {step === 'authorizing' && (
            <Button variant="outline" onClick={() => { setStep('select') }}>返回选择</Button>
          )}
          {step === 'success' && (
            <Button variant="primary" onClick={handleFinish}>完成并进入账号池</Button>
          )}
        </footer>
      </div>
    </div>
  )
}
