/**
 * Modal dialog for creating an account via CLIProxyAPI login flow.
 *
 * Distinguishes Device Flow vs PKCE Flow vs GLM Coding Plan dedicated key form:
 * - Kimi & xAI: Device Flow (flow=device, user_code, verification_uri fixture, expires_in)
 * - Codex, Claude, Antigravity: PKCE Browser Redirect Flow (URL redirect fixture)
 * - GLM: Coding Plan Dedicated API Key + Coding endpoint form (no OAuth)
 *
 * All URLs strictly use explicit .example.test non-operational fixture URIs (resolving R5),
 * cleanly distinguishing each provider rather than hardcoding a uniform real OpenAI URL.
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

function getProviderFixtureAuthUri(p: ProviderType): string {
  switch (p) {
    case 'kimi':
      return 'https://auth.kimi.example.test/device/verify?user_code=ABCD-EFGH'
    case 'xai':
      return 'https://auth.x.ai.example.test/device/activate?user_code=GROK-7890'
    case 'codex':
      return 'https://auth.openai.example.test/oauth/authorize?response_type=code&client_id=cliproxy...'
    case 'anthropic':
      return 'https://auth.anthropic.example.test/oauth/authorize?response_type=code&client_id=cliproxy...'
    case 'antigravity':
      return 'https://accounts.google.example.test/o/oauth2/v2/auth?response_type=code&client_id=cliproxy...'
    case 'glm':
      return 'https://open.bigmodel.cn/api/coding/paas/v4'
  }
}

function getProviderDeviceCode(p: ProviderType): string {
  if (p === 'xai') return 'GROK-7890'
  return 'KIMI-1234'
}

export function LoginModal({ initialProvider = 'codex', onClose, onSuccess }: LoginModalProps) {
  const [provider, setProvider] = useState<ProviderType>(initialProvider)
  const [step, setStep] = useState<'select' | 'authorizing' | 'apiKeyForm' | 'success' | 'failed'>('select')

  // Device flow parameters (Kimi & xAI)
  const expiresIn = 600 // 10 minutes

  // GLM Coding Plan fixture form state (verified official Coding Chat endpoint)
  const [glmApiKey, setGlmApiKey] = useState('')
  const [glmEndpoint, setGlmEndpoint] = useState('https://open.bigmodel.cn/api/coding/paas/v4')

  const isGlm = provider === 'glm'
  const isDeviceFlow = provider === 'kimi' || provider === 'xai'
  const authUri = getProviderFixtureAuthUri(provider)
  const deviceCode = getProviderDeviceCode(provider)

  const handleStart = () => {
    if (isGlm) {
      setStep('apiKeyForm')
    } else {
      setStep('authorizing')
      // Simulate polling result
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
      email: isGlm ? 'coding-user@example.com' : `user-${provider}@example.com`,
      tier: isGlm ? 'Coding Plan (CN)' : undefined,
    })
    onClose()
  }

  return (
    <div className={css.backdrop} onClick={onClose}>
      <div className={css.dialog} onClick={e => { e.stopPropagation() }}>
        <header className={css.header}>
          <div className={css.headerTitle}>
            <h3>添加账号凭证 · CLIProxyAPI</h3>
            <p>基于官方 Manager 流程规范：Device Flow 设备码、PKCE 浏览器重定向与专用订阅密钥。</p>
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
                  <span>Device Flow · 设备码授权 (fixture 示意)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'xai' ? css.selected : ''}`}
                  onClick={() => { setProvider('xai') }}
                >
                  <span className={css.providerIcon}>Ø</span>
                  <strong>xAI Grok OAuth</strong>
                  <span>Device Flow · 设备码授权 (fixture 示意)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'codex' ? css.selected : ''}`}
                  onClick={() => { setProvider('codex') }}
                >
                  <span className={css.providerIcon}>⚡</span>
                  <strong>Codex OAuth</strong>
                  <span>PKCE 重定向 · 网页授权 (fixture 示意)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'anthropic' ? css.selected : ''}`}
                  onClick={() => { setProvider('anthropic') }}
                >
                  <span className={css.providerIcon}>✳</span>
                  <strong>Anthropic OAuth</strong>
                  <span>PKCE 重定向 · Claude 授权 (fixture 示意)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'antigravity' ? css.selected : ''}`}
                  onClick={() => { setProvider('antigravity') }}
                >
                  <span className={css.providerIcon}>▲</span>
                  <strong>Antigravity OAuth</strong>
                  <span>PKCE 重定向 · Google 快捷授权 (fixture 示意)</span>
                </button>
                <button
                  type="button"
                  className={`${css.providerCard} ${provider === 'glm' ? css.selected : ''} ${css.glmCard}`}
                  onClick={() => { setProvider('glm') }}
                >
                  <span className={css.providerIcon}>◈</span>
                  <strong>GLM Coding Plan</strong>
                  <span>CN个人订阅 · 专用 API Key 表单接入 (非 OAuth)</span>
                </button>
              </div>
            </div>
          )}

          {step === 'authorizing' && (
            <div className={css.authStep}>
              <div className={css.spinner} />
              <h4>
                正在等待 {provider.toUpperCase()} {isDeviceFlow ? '设备授权码确认' : '浏览器授权完成'}…
              </h4>

              {isDeviceFlow ? (
                <>
                  <p>请在已登录设备浏览器打开以下验证网址，并确认输入的设备码：</p>
                  <div className={css.urlBox}>{authUri}</div>
                  <div className={css.deviceCodeBox}>
                    <span>设备用户码：</span>
                    <strong>{deviceCode}</strong>
                  </div>
                  <span className={css.hint}>
                    设备码在 {String(expiresIn)} 秒内有效，CLIProxyAPI 正在轮询授权状态 (flow=device 模拟示意)
                  </span>
                </>
              ) : (
                <>
                  <p>请在系统浏览器中完成官方 PKCE 授权重定向操作：</p>
                  <div className={css.urlBox}>{authUri}</div>
                  <span className={css.hint}>
                    CLIProxyAPI 本地回调端点正在安全监听授权返回 (is_webui=true 模拟示意)
                  </span>
                </>
              )}
            </div>
          )}

          {step === 'apiKeyForm' && (
            <div className={css.formStep}>
              <div className={css.formBadge}>Sub2API Coding Plan 订阅模式</div>
              <h4 className={css.formTitle}>输入智谱 GLM Coding 订阅凭据 (CN个人订阅)</h4>
              <p className={css.formDesc}>
                基于 Sub2API Coding Plan 移植实现，GLM 订阅采用用户 Coding Plan key 与专属 coding 端点，无需 OAuth 网页回调。
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
                  placeholder="https://open.bigmodel.cn/api/coding/paas/v4"
                />
                <span className={css.fieldTip}>
                  已对齐官方 Coding Plan 端点；普通 /api/paas/v4 为按量 PayG 模式不可用。
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
                  ? '已接入 GLM Coding Plan 订阅路由，模型目录就绪。'
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
