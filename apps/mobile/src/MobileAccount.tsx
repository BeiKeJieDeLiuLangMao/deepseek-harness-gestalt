import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PlatformAccountInstallation } from '@deepseek-ai/dsh-platform-account-client'
import { ACCOUNT_PRIVACY_NOTICE } from '@deepseek-ai/dsh-platform-account/privacy'
import {
  parseAttachmentCapability,
  parseCompanionOperationId,
  parseCompanionSessionId,
} from '@deepseek-ai/dsh-remote-protocol'
import { companionMayMutate, companionRuntime } from './companion-push.ts'
import css from './MobileAccount.module.css'
import { sealCompanionAttachment, buildCompanionAttachmentOffer } from './companion-attachment.ts'
import type { CompanionInteraction } from './companion-approval.ts'
import type { CompanionSessionSummary } from './companion-history.ts'
import { developmentCompanionClient, type CompanionSearchSnapshot } from './development-keyless-companion.ts'
import { MobileBrowse } from './MobileBrowse.tsx'
import { MobilePairing, type MobilePairingActions } from './MobilePairing.tsx'
import type { MobilePairingSnapshot } from './personal-pairing-model.ts'

const EMPTY_SESSIONS: readonly CompanionSessionSummary[] = []
const EMPTY_SEARCH: CompanionSearchSnapshot = { query: '', status: 'idle', hits: EMPTY_SESSIONS }

/** Signed-in Mobile surface after Platform Account login. */
type SignedInScreen = 'home' | 'account' | 'pairing'

/** Mobile Account page props. */
export interface MobileAccountProps {
  /** Current Mobile installation lifecycle controller. */
  installation: PlatformAccountInstallation
  /** Personal Pairing adapter available after the current Installation signs in. */
  pairing?: MobilePairingActions
}

/** Mobile Account landing with an optional same-installation Personal Pairing projection. */
export function MobileAccount({ installation, pairing }: MobileAccountProps): ReactNode {
  const snapshot = useSyncExternalStore(
    listener => installation.subscribe(listener),
    () => installation.getSnapshot(),
  )
  const companion = companionRuntime()
  const companionState = useSyncExternalStore(
    listener => companion?.subscribe(listener) ?? (() => {}),
    () => companion?.getState(),
  )
  const pairingSnapshot = useSyncExternalStore(
    listener => pairing?.subscribe(listener) ?? (() => {}),
    () => pairing?.getSnapshot(),
  )
  const [accepted, setAccepted] = useState(false)
  const [screen, setScreen] = useState<SignedInScreen>('home')
  const companionClient = developmentCompanionClient()
  const sessions = useSyncExternalStore(
    listener => companionClient?.sessions().subscribe(listener) ?? (() => {}),
    () => companionClient?.sessions().getSnapshot() ?? EMPTY_SESSIONS,
  )
  const search = useSyncExternalStore(
    listener => companionClient?.sessions().subscribe(listener) ?? (() => {}),
    () => companionClient?.sessions().getSearchSnapshot() ?? EMPTY_SEARCH,
  )

  useEffect(() => { void installation.load() }, [installation])
  useEffect(() => {
    if (snapshot.status !== 'polling') return
    let stopped = false
    const poll = async (): Promise<void> => {
      try {
        const result = await installation.pollLogin()
        if (!stopped && result.status === 'pending') window.setTimeout(() => { void poll() }, 1500)
      } catch {
        // The controller publishes the actionable failure message.
      }
    }
    void poll()
    return () => { stopped = true }
  }, [installation, snapshot.status])
  useEffect(() => {
    if (snapshot.status !== 'signed-in' || pairing === undefined) return
    void pairing.activate()
    return () => { void pairing.deactivate() }
  }, [pairing, snapshot.status])
  useEffect(() => {
    if (pairingSnapshot?.status === 'paired') setScreen(current => current === 'pairing' ? 'home' : current)
  }, [pairingSnapshot?.status])

  const account = snapshot.status === 'signed-in' ? snapshot.account : undefined
  const signedIn = account !== undefined
  const signOut = (): void => {
    setAccepted(false)
    setScreen('home')
    void installation.signOut()
  }

  if (!signedIn) {
    return (
      <main className={css.page} data-mobile-platform-account={snapshot.status}>
        <header className={css.header}>
          <div className={css.mark} aria-hidden="true">深</div>
          <div>
            <p className={css.product}>DeepSeek Gestalt</p>
            <h1>连接你的 Platform Account</h1>
          </div>
        </header>
        <section className={css.notice} aria-labelledby="privacy-title">
          <div className={css.noticeHead}>
            <span>授权前必读</span>
            <h2 id="privacy-title">隐私说明 / Privacy notice</h2>
          </div>
          <div className={css.languages}>
            <p lang="zh-CN">{ACCOUNT_PRIVACY_NOTICE.zh}</p>
            <p lang="en">{ACCOUNT_PRIVACY_NOTICE.en}</p>
          </div>
          <dl className={css.retention}>
            <div><dt>GitHub 权限</dt><dd>公开身份 · 无 OAuth scope</dd></div>
            <div><dt>保留期</dt><dd>IP ≤ 7 天 · 安全事件 ≤ 30 天</dd></div>
            <div><dt>账号删除</dt><dd>首个版本暂不提供</dd></div>
          </dl>
        </section>
        <label className={css.consent}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => {
              setAccepted(event.target.checked)
              if (event.target.checked) {
                installation.acceptPrivacy()
                void installation.prepareLogin()
              }
            }}
          />
          <span>我已阅读中英文隐私说明</span>
        </label>
        <button
          type="button"
          className={css.primary}
          disabled={!accepted || snapshot.status !== 'ready'}
          onClick={() => { installation.openLogin() }}
        >
          {snapshot.status === 'preparing'
            ? '准备安全授权…'
            : snapshot.status === 'polling'
              ? '等待 GitHub 授权…'
              : '使用 GitHub 继续'}
        </button>
        {snapshot.error !== undefined && <p className={css.error} role="alert">{snapshot.error}</p>}
        <footer>此账号仅识别你的安装；它不会授予任何 Desktop 访问权限。</footer>
      </main>
    )
  }

  if (screen === 'account') {
    return (
      <main className={css.companion} data-mobile-platform-account={snapshot.status}>
        <AccountView
          login={account.githubLogin}
          githubId={account.githubId}
          avatarUrl={account.avatarUrl}
          pairing={pairingSnapshot}
          onBack={() => { setScreen('home') }}
          onSignOut={signOut}
          {...(pairing === undefined || pairingSnapshot?.status !== 'paired'
            ? {}
            : { onUnpair: () => { void pairing.unpair() } })}
          {...(companionClient === undefined
            ? {}
            : { onClearCache: () => { void companionClient.clearOpenedCache() } })}
        />
      </main>
    )
  }

  if (screen === 'pairing' && pairing !== undefined) {
    return (
      <main className={css.companion} data-mobile-platform-account={snapshot.status}>
        <MobilePairing
          actions={pairing}
          manageLifecycle={false}
          onBack={() => { setScreen('home') }}
        />
      </main>
    )
  }

  return (
    <main className={css.companion} data-mobile-platform-account={snapshot.status}>
      {pairingSnapshot?.status === 'unavailable' && (
        <p className={css.banner} role="alert">{pairingSnapshot.error}</p>
      )}
      {snapshot.error !== undefined && <p className={css.error} role="alert">{snapshot.error}</p>}
      <MobileBrowse
        desktopName="Paired Desktop"
        connection={homeConnection(pairingSnapshot, companionState !== undefined && companionMayMutate(companionState))}
        sessions={sessions}
        accountLogin={account.githubLogin}
        accountAvatarUrl={account.avatarUrl}
        onOpenAccount={() => { setScreen('account') }}
        {...(companion === undefined ? {} : { onRecover: () => { companion.synchronize() } })}
        {...(pairing === undefined || pairingSnapshot?.status === 'paired' || pairingSnapshot?.status === 'unavailable'
          ? {}
          : { onScanPairing: () => { setScreen('pairing') } })}
        {...(companionState === undefined ? {} : { companionState })}
        {...(companionClient !== undefined
          ? {
            onOpenSession: (sessionId: string) => {
              companionClient.sessions().clearError()
              ignoreUnconfirmedCompanion(companionClient.openSession(sessionId), companionClient)
            },
            onSearch: (query: string) => {
              ignoreUnconfirmedCompanion(companionClient.searchSessions(query), companionClient)
            },
            searchHits: search.hits,
            searchStatus: search.status,
            ...(search.error === undefined ? {} : { searchError: search.error }),
            onCreate: (input: { workspace?: string }) => {
              if (companionState === undefined || !companionMayMutate(companionState)) return
              const title = input.workspace === undefined ? 'Ungrouped Session' : 'Workspace Session'
              ignoreUnconfirmedCompanion(companionClient.createSession({
                operationId: crypto.randomUUID(),
                sessionId: crypto.randomUUID(),
                title,
                ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
              }), companionClient)
            },
            onSubmit: (sessionId: string, text: string) => {
              if (companionState === undefined || !companionMayMutate(companionState)) return
              ignoreUnconfirmedCompanion(companionClient.submitPrompt({
                operationId: crypto.randomUUID(),
                sessionId,
                text,
              }), companionClient)
            },
            onCancel: (sessionId: string) => {
              if (companionState === undefined || !companionMayMutate(companionState)) return
              ignoreUnconfirmedCompanion(companionClient.cancelPrompt({
                operationId: crypto.randomUUID(),
                sessionId,
              }), companionClient)
            },
            onAttach: (sessionId: string, file: File) => {
              if (companionState === undefined || !companionMayMutate(companionState)) return
              ignoreUnconfirmedCompanion(offerDevelopmentAttachment(companionClient, sessionId, file), companionClient)
            },
            onSettled: (sessionId: string, interaction: CompanionInteraction) => {
              if (companionState === undefined || !companionMayMutate(companionState)) return
              ignoreUnconfirmedCompanion(settleDevelopmentInteraction(companionClient, sessionId, interaction), companionClient)
            },
          }
          : {})}
      />
    </main>
  )
}

function homeConnection(
  pairing: MobilePairingSnapshot | undefined,
  online: boolean,
): 'unpaired' | 'online' | 'offline' {
  if (pairing?.status !== 'paired') return 'unpaired'
  return online ? 'online' : 'offline'
}

function AccountView({
  login,
  githubId,
  avatarUrl,
  pairing,
  onBack,
  onSignOut,
  onUnpair,
  onClearCache,
}: {
  login: string
  githubId: number
  avatarUrl: string
  pairing: MobilePairingSnapshot | undefined
  onBack: () => void
  onSignOut: () => void
  onUnpair?: () => void
  onClearCache?: () => void
}): ReactNode {
  return (
    <section className={css.accountPage} aria-label="当前安装账号">
      <header>
        <button type="button" className={css.sheetClose} onClick={onBack}>返回</button>
        <h1>账号</h1>
      </header>
      <img src={avatarUrl} alt="" />
      <div className={css.identity}>
        <strong>@{login}</strong>
        <span>GitHub ID {githubId}</span>
      </div>
      <span className={css.status}>当前安装</span>
      {onUnpair !== undefined && pairing?.status === 'paired' && (
        <button type="button" className={css.secondary} onClick={onUnpair}>解除配对</button>
      )}
      {onClearCache !== undefined && (
        <button type="button" className={css.secondary} onClick={onClearCache}>清除此 Desktop 缓存</button>
      )}
      <button type="button" className={css.secondary} onClick={onSignOut}>退出登录</button>
    </section>
  )
}

function ignoreUnconfirmedCompanion(
  operation: Promise<unknown>,
  client?: NonNullable<ReturnType<typeof developmentCompanionClient>>,
): void {
  void operation.catch((error: unknown) => {
    client?.sessions().applyError(error instanceof Error ? error.message : 'Desktop 未确认这次操作')
  })
}

async function offerDevelopmentAttachment(
  client: NonNullable<ReturnType<typeof developmentCompanionClient>>,
  sessionId: string,
  file: File,
): Promise<unknown> {
  const sealed = await sealCompanionAttachment(
    new Uint8Array(32).fill(29),
    new Uint8Array(await file.arrayBuffer()),
  )
  return await client.offerAttachment(buildCompanionAttachmentOffer({
    capability: parseAttachmentCapability('A'.repeat(43)),
    ciphertextSha256: sealed.ciphertextSha256,
    byteLength: sealed.ciphertext.byteLength,
    expiresAt: Date.now() + 900_000,
    fileName: file.name.length === 0 ? 'attachment.bin' : file.name,
  }, parseCompanionOperationId(crypto.randomUUID()), parseCompanionSessionId(sessionId)))
}

async function settleDevelopmentInteraction(
  client: NonNullable<ReturnType<typeof developmentCompanionClient>>,
  sessionId: string,
  interaction: CompanionInteraction,
): Promise<unknown> {
  const decision = interaction.settled?.decision ?? interaction.authorized[0]
  if (decision === undefined) return
  const input = {
    operationId: crypto.randomUUID(),
    sessionId,
    interactionId: interaction.operationId,
    decision,
    ...(interaction.settled?.persistent === undefined ? {} : { persistent: interaction.settled.persistent }),
  }
  return interaction.kind === 'approval'
    ? await client.settleApproval(input)
    : await client.answerAskUser(input)
}
