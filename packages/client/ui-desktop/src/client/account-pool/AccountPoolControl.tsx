/** Built-in CLIProxyAPI account pool: dual-face cards and supported logins. */
import { useEffect, useRef, useState } from 'react'
import { Button, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DesktopAccountPoolAccount, DesktopAccountPoolEditableFields, DesktopAccountPoolModel, DesktopAccountPoolSnapshot,
} from '../../protocol.ts'
import { AccountCard } from './AccountCard.tsx'
import { AccountDialog } from './AccountDialog.tsx'
import { LoginModal } from './LoginModal.tsx'
import { ModelsDialog } from './ModelsDialog.tsx'
import { PROVIDER_FILTERS, ProviderIcon, providerDisplayName } from './ProviderIcon.tsx'
import { SettingsDialog } from './SettingsDialog.tsx'
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

interface OpenModels {
  readonly name: string
  readonly models: readonly DesktopAccountPoolModel[]
}

interface OpenSettings {
  readonly account: DesktopAccountPoolAccount
  readonly details?: DesktopAccountPoolEditableFields
  readonly models?: readonly { id: string; name?: string }[]
}

export function AccountPoolControl({ t, useAccountPool }: AccountPoolControlProps) {
  const snapshot = useAccountPool(value => value)
  const desktop = window.dshDesktop
  const [globalFace, setGlobalFace] = useState<'A' | 'B'>('A')
  const [globalEpoch, setGlobalEpoch] = useState(0)
  const [filter, setFilter] = useState('all')
  const [loginOpen, setLoginOpen] = useState(false)
  const [refreshingQuota, setRefreshingQuota] = useState<string | 'all' | undefined>()
  const [refreshingRoster, setRefreshingRoster] = useState(false)
  const [modelsDialog, setModelsDialog] = useState<OpenModels | undefined>()
  const [settingsDialog, setSettingsDialog] = useState<OpenSettings | undefined>()
  const [pendingDelete, setPendingDelete] = useState<DesktopAccountPoolAccount | undefined>()
  const hadLogin = useRef(false)
  useEffect(() => {
    if (snapshot.login !== undefined) {
      hadLogin.current = true
      return
    }
    if (hadLogin.current) {
      hadLogin.current = false
      setLoginOpen(false)
    }
  }, [snapshot.login])
  useEffect(() => {
    const state = snapshot.login?.state
    if (desktop === undefined || state === undefined) return undefined
    const timer = window.setInterval(() => { void desktop.accountPoolLoginStatus(state) }, 1_500)
    return () => { window.clearInterval(timer) }
  }, [desktop, snapshot.login?.state])
  if (desktop === undefined) return null
  const accounts = snapshot.accounts.filter(account => filter === 'all' || account.provider === filter || (filter === 'anthropic' && account.provider === 'claude'))
  const commandFace = (face: 'A' | 'B'): void => {
    setGlobalFace(face)
    setGlobalEpoch(epoch => epoch + 1)
  }
  return (
    <section className={css.poolHost} data-desktop-account-pool-state={snapshot.state}>
      <header className={css.workspaceHeader}>
        <div className={css.headerLeft}>
          <div className={css.titleRow}>
            <h2 className={css.pageTitle} data-testid="account-pool-title">{t('sub2api.workspaceTitle')}</h2>
            <span className={css.titleStatus} data-testid="account-pool-status">
              <span className={snapshot.state === 'ready' ? css.healthyDot : css.runtimeText} />
              <span className={css.runtimeText}>{snapshot.state === 'ready' ? t('sub2api.running') : snapshot.error ?? t('sub2api.starting')}</span>
            </span>
          </div>
          <div className={css.summaryCounts}>
            <span>{t('sub2api.credentialsCount', { count: snapshot.accounts.length })}</span>
            <span className={css.countActive}>{t('sub2api.enabledCount', { count: snapshot.accounts.filter(account => account.enabled).length })}</span>
          </div>
        </div>
        <div className={css.headerRight}>
          <div className={css.globalFaceSwitch}>
            <span className={css.switchTitle}>{t('sub2api.cardView')}</span>
            <div className={css.switchGroup}>
              <button type="button" className={`${css.faceBtn} ${globalFace === 'A' ? css.faceBtnActive : ''}`} onClick={() => { commandFace('A') }} data-testid="global-face-btn-a">
                {t('sub2api.faceManage')}
              </button>
              <button type="button" className={`${css.faceBtn} ${globalFace === 'B' ? css.faceBtnActive : ''}`} onClick={() => { commandFace('B') }} data-testid="global-face-btn-b">
                {t('sub2api.faceQuota')}
              </button>
            </div>
          </div>
          <Button
            variant="ghost"
            aria-busy={refreshingQuota === 'all'}
            icon={<span className={refreshingQuota === 'all' ? css.spinning : undefined} aria-hidden>↻</span>}
            onClick={() => {
              setRefreshingQuota('all')
              void desktop.accountPoolRefreshAllQuota().finally(() => { setRefreshingQuota(undefined) })
            }}
          >
            {t('sub2api.refreshAllQuota')}
          </Button>
          <Button variant="primary" onClick={() => { setLoginOpen(true) }}>{t('sub2api.addAccount')}</Button>
        </div>
      </header>
      <div className={css.filterBar}>
        <Pill active={filter === 'all'} onClick={() => { setFilter('all') }} data-testid="filter-all">
          <span className={css.filterLabel}><ProviderIcon provider="all" />{t('sub2api.filterAll', { count: snapshot.accounts.length })}</span>
        </Pill>
        {PROVIDER_FILTERS.map(provider => (
          <Pill key={provider} active={filter === provider} onClick={() => { setFilter(provider) }} data-testid={`filter-${provider}`}>
            <span className={css.filterLabel}>
              <ProviderIcon provider={provider} />
              {providerDisplayName(provider)} ({snapshot.accounts.filter(account => account.provider === provider || (provider === 'anthropic' && account.provider === 'claude')).length})
            </span>
          </Pill>
        ))}
      </div>
      <div className={css.cardsGrid}>
        {accounts.map(account => (
          <AccountCard
            key={account.authIndex}
            t={t}
            item={account}
            globalFace={globalFace}
            globalEpoch={globalEpoch}
            refreshingQuota={refreshingQuota === 'all' || refreshingQuota === account.authIndex}
            refreshingRoster={refreshingRoster}
            onToggleStatus={(name, enabled) => { void desktop.accountPoolSetEnabled(name, enabled) }}
            onRefreshQuota={(authIndex) => {
              setRefreshingQuota(authIndex)
              void desktop.accountPoolRefreshQuota(authIndex).finally(() => { setRefreshingQuota(undefined) })
            }}
            onDelete={() => { setPendingDelete(account) }}
            onListModels={(name) => {
              void desktop.accountPoolListModels(name).then((models) => {
                setModelsDialog({ name, models })
              })
            }}
            onRefresh={() => {
              setRefreshingRoster(true)
              const started = Date.now()
              void desktop.accountPoolRefresh().finally(() => {
                const remain = 600 - (Date.now() - started)
                window.setTimeout(() => { setRefreshingRoster(false) }, Math.max(0, remain))
              })
            }}
            onDownload={(name) => { void desktop.accountPoolDownload(name) }}
            onEditSettings={(item) => {
              setSettingsDialog({ account: item })
              void desktop.accountPoolReadFields(item.name).then((details) => {
                setSettingsDialog(current => current === undefined ? current : { ...current, details })
              })
              void desktop.accountPoolListModels(item.name).then((models) => {
                setSettingsDialog(current => current === undefined ? current : { ...current, models })
              })
            }}
          />
        ))}
      </div>
      {pendingDelete !== undefined && (
        <AccountDialog
          title={t('sub2api.deleteTitle')}
          description={pendingDelete.name}
          closeLabel={t('sub2api.close')}
          onClose={() => { setPendingDelete(undefined) }}
        >
          <p className={css.dialogEmpty}>{t('sub2api.deleteBody')}</p>
          <div className={css.confirmFooter}>
            <Button variant="ghost" data-testid="delete-cancel" onClick={() => { setPendingDelete(undefined) }}>{t('sub2api.cancel')}</Button>
            <Button
              variant="primary"
              data-testid="delete-confirm"
              onClick={() => {
                const name = pendingDelete.name
                setPendingDelete(undefined)
                void desktop.accountPoolDelete(name)
              }}
            >
              {t('sub2api.deleteConfirm')}
            </Button>
          </div>
        </AccountDialog>
      )}
      {modelsDialog !== undefined && (
        <ModelsDialog
          t={t}
          name={modelsDialog.name}
          models={modelsDialog.models}
          onClose={() => { setModelsDialog(undefined) }}
        />
      )}
      {settingsDialog !== undefined && (
        <SettingsDialog
          t={t}
          account={settingsDialog.account}
          {...settingsDialog.details === undefined ? {} : { details: settingsDialog.details }}
          {...settingsDialog.models === undefined ? {} : { models: settingsDialog.models }}
          onClose={() => { setSettingsDialog(undefined) }}
          onSave={(name, fields) => {
            void desktop.accountPoolPatchFields(name, fields)
            setSettingsDialog(undefined)
          }}
        />
      )}
      {(loginOpen || snapshot.login !== undefined) && (
        <LoginModal
          t={t}
          initialProvider={snapshot.login?.kind ?? 'kimi'}
          {...snapshot.login === undefined ? {} : { login: snapshot.login }}
          onClose={() => {
            setLoginOpen(false)
            void desktop.accountPoolDismissLogin()
          }}
          onStart={(kind) => { void desktop.accountPoolStartLogin(kind) }}
          onCancel={(state) => { void desktop.accountPoolCancelLogin(state); setLoginOpen(false) }}
          onOpenExternal={(url) => { void desktop.accountPoolOpenExternal(url) }}
          onSubmitCallback={(input) => { void desktop.accountPoolSubmitCallback(input) }}
          onSubmitGlmKey={(input) => { void desktop.accountPoolSubmitGlmKey(input); setLoginOpen(false) }}
        />
      )}
    </section>
  )
}
