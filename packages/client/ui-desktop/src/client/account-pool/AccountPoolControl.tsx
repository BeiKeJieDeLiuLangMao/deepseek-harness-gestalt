/** Built-in CLIProxyAPI account pool: dual-face cards and supported logins. */
import { useEffect, useState } from 'react'
import { Button, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountPoolLoginKind, DesktopAccountPoolSnapshot } from '../../protocol.ts'
import { AccountCard } from './AccountCard.tsx'
import { LoginModal } from './LoginModal.tsx'
import css from './AccountPool.module.css'

export type AccountPoolControlInjected = {
  hooks: {
    accountPool: {
      getSnapshot: () => DesktopAccountPoolSnapshot
      subscribe: (listener: () => void) => () => void
    }
  }
}

export type AccountPoolControlProps = PropsRuntime<'settings.section'>
  & PropsLocale<'desktop'>
  & {
    useAccountPool: SnapshotSelectorHook<DesktopAccountPoolSnapshot>
  }

export function AccountPoolControl({ t, useAccountPool }: AccountPoolControlProps) {
  const snapshot = useAccountPool(value => value)
  const desktop = window.dshDesktop
  const [globalFace, setGlobalFace] = useState<'A' | 'B'>('A')
  const [globalEpoch, setGlobalEpoch] = useState(0)
  const [filter, setFilter] = useState('all')
  const [showDropdown, setShowDropdown] = useState(false)
  const [loginKind, setLoginKind] = useState<AccountPoolLoginKind | undefined>(undefined)
  useEffect(() => {
    const state = snapshot.login?.state
    if (desktop === undefined || state === undefined) return undefined
    const timer = window.setInterval(() => { void desktop.accountPoolLoginStatus(state) }, 1_500)
    return () => { window.clearInterval(timer) }
  }, [desktop, snapshot.login?.state])
  if (desktop === undefined) return null
  const accounts = snapshot.accounts.filter(account => filter === 'all' || account.provider === filter)
  const commandFace = (face: 'A' | 'B'): void => {
    setGlobalFace(face)
    setGlobalEpoch(epoch => epoch + 1)
  }
  const openLogin = (kind: AccountPoolLoginKind): void => {
    setShowDropdown(false)
    setLoginKind(kind)
    if (kind !== 'glm') void desktop.accountPoolStartLogin(kind)
  }
  return (
    <section className={css.prototypeHost} data-desktop-account-pool-state={snapshot.state}>
      <div className={css.kernelBar}>
        <div className={css.kernelInfo}>
          <span className={css.kernelBadge}>DESKTOP BUILT-IN</span>
          <strong className={css.kernelTitle} data-testid="account-pool-title">{t('sub2api.title')}</strong>
          <span className={css.kernelDesc}>{t('sub2api.offerBody')}</span>
        </div>
        <div className={css.kernelActions}>
          <span className={snapshot.state === 'ready' ? css.healthyDot : css.runtimeText} />
          <span className={css.runtimeText}>{snapshot.state === 'ready' ? t('sub2api.running') : snapshot.error ?? t('sub2api.starting')}</span>
        </div>
      </div>
      <header className={css.workspaceHeader}>
        <div className={css.headerLeft}>
          <h2 className={css.pageTitle}>{t('sub2api.workspaceTitle')}</h2>
          <div className={css.summaryCounts}>
            <span>共 {snapshot.accounts.length} 个凭证</span>
            <span className={css.countActive}>{snapshot.accounts.filter(account => account.enabled).length} 个启用</span>
          </div>
        </div>
        <div className={css.headerRight}>
          <div className={css.globalFaceSwitch}>
            <span className={css.switchTitle}>卡片视图:</span>
            <div className={css.switchGroup}>
              <button type="button" className={`${css.faceBtn} ${globalFace === 'A' ? css.faceBtnActive : ''}`} onClick={() => { commandFace('A') }} data-testid="global-face-btn-a">
                管理面
              </button>
              <button type="button" className={`${css.faceBtn} ${globalFace === 'B' ? css.faceBtnActive : ''}`} onClick={() => { commandFace('B') }} data-testid="global-face-btn-b">
                额度面
              </button>
            </div>
          </div>
          <div className={css.addDropdownContainer}>
            <Button variant="primary" onClick={() => { setShowDropdown(open => !open) }}>+ 添加账号 ▾</Button>
            {showDropdown && (
              <div className={css.dropdownMenu}>
                {(['kimi', 'xai', 'codex', 'anthropic', 'antigravity', 'glm'] as const).map(kind => (
                  <button key={kind} type="button" className={css.dropdownItem} onClick={() => { openLogin(kind) }}>
                    {kind.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className={css.filterBar}>
        <Pill active={filter === 'all'} onClick={() => { setFilter('all') }}>全部 ({snapshot.accounts.length})</Pill>
        {['codex', 'antigravity', 'anthropic', 'kimi', 'xai', 'glm'].map(provider => (
          <Pill key={provider} active={filter === provider} onClick={() => { setFilter(provider) }}>
            {provider} ({snapshot.accounts.filter(account => account.provider === provider).length})
          </Pill>
        ))}
      </div>
      <div className={css.cardsGrid}>
        {accounts.map(account => (
          <AccountCard
            key={account.authIndex}
            item={account}
            globalFace={globalFace}
            globalEpoch={globalEpoch}
            onToggleStatus={(name, enabled) => { void desktop.accountPoolSetEnabled(name, enabled) }}
            onRefreshQuota={(authIndex) => { void desktop.accountPoolRefreshQuota(authIndex) }}
            onDelete={(name) => { void desktop.accountPoolDelete(name) }}
          />
        ))}
      </div>
      {loginKind !== undefined && (
        <LoginModal
          initialProvider={loginKind}
          {...snapshot.login === undefined ? {} : { login: snapshot.login }}
          onClose={() => { setLoginKind(undefined) }}
          onStart={(kind) => { void desktop.accountPoolStartLogin(kind) }}
          onCancel={(state) => { void desktop.accountPoolCancelLogin(state); setLoginKind(undefined) }}
          onSubmitGlmKey={(input) => { void desktop.accountPoolSubmitGlmKey(input); setLoginKind(undefined) }}
        />
      )}
    </section>
  )
}
