/** Desktop Mobile Pairing Settings section and bilingual pre-authorization notice. */

import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopAccountSnapshot } from '../protocol.ts'
import css from './AccountControl.module.css'

/** Injected current-installation Account snapshot. */
export type AccountControlInjected = {
  hooks: {
    account: {
      getSnapshot: () => DesktopAccountSnapshot
      subscribe: (listener: () => void) => () => void
    }
  }
}

/** Settings-section props plus Desktop copy and Account hook. */
export type AccountControlProps = PropsRuntime<'settings.section'>
  & PropsLocale<'desktop'>
  & { useAccount: SnapshotSelectorHook<DesktopAccountSnapshot> }

/** Render Account state inside the Desktop-only Mobile Pairing Settings section. */
export function AccountControl({ t, useAccount }: AccountControlProps) {
  const snapshot = useAccount(value => value)
  const desktop = window.dshDesktop
  if (desktop === undefined) return null
  return (
    <section className={css.root} data-desktop-account-control={snapshot.status}>
      <header className={css.header}>
        <span className={css.mark}>G</span>
        <div>
          <h2>{t('account.title')}</h2>
          <p>{t('account.sectionDescription')}</p>
        </div>
      </header>
      <AccountPanel snapshot={snapshot} t={t} />
    </section>
  )
}

function AccountPanel({ snapshot, t }: {
  snapshot: DesktopAccountSnapshot
  t: AccountControlProps['t']
}) {
  const desktop = window.dshDesktop
  if (desktop === undefined) return null
  if (snapshot.status === 'unavailable') {
    return <p className={css.error}>{snapshot.error ?? t('account.unavailable')}</p>
  }
  if ((snapshot.status === 'signed-in' || snapshot.status === 'signing-out') && snapshot.account !== undefined) {
    return (
      <div className={css.signedIn}>
        <img className={css.profileAvatar} src={snapshot.account.avatarUrl} alt="" />
        <div>
          <strong>{snapshot.account.githubLogin}</strong>
          <p>{t('account.currentInstallation')}</p>
        </div>
        <Button
          variant="outline"
          disabled={snapshot.status === 'signing-out'}
          onClick={() => { void desktop.accountSignOut() }}
        >
          {t('account.signOut')}
        </Button>
      </div>
    )
  }
  if (snapshot.status === 'polling' || snapshot.status === 'authorizing') {
    return (
      <div className={css.waiting} aria-live="polite">
        <span className={css.spinner} />
        <strong>{t('account.finishBrowser')}</strong>
        <p>{t('account.polling')}</p>
      </div>
    )
  }
  return (
    <div className={css.notice}>
      <div className={css.noticeHeader}>
        <span>{t('account.privacyBadge')}</span>
        <strong>{t('account.noticeTitle')}</strong>
      </div>
      <p lang="zh-CN">Platform 会保存 GitHub 数字 ID、公开登录名与头像、安装和配对元数据及推送令牌。原始 IP 日志最多保留 7 天，非内容安全事件最多保留 30 天；加密附件只在传输所需的短期内保留。首个版本不提供账号删除；退出登录只撤销当前安装，不删除个人配对。</p>
      <p lang="en">Platform stores the numeric GitHub id, public login and avatar, installation and pairing metadata, and push tokens. Raw IP logs are retained for at most 7 days, content-free security events for at most 30 days, and encrypted attachment blobs only for the short transfer lifetime. The first version does not provide account deletion; signing out revokes only this installation and does not delete Personal Pairings.</p>
      {snapshot.error !== undefined && <p className={css.error}>{snapshot.error}</p>}
      <label className={css.consent}>
        <input
          type="checkbox"
          checked={snapshot.privacyAccepted}
          onChange={() => { void desktop.accountAcceptPrivacy() }}
        />
        <span>{t('account.consent')}</span>
      </label>
      <Button
        variant="primary"
        disabled={!snapshot.privacyAccepted}
        onClick={() => { void desktop.accountBeginLogin() }}
      >
        {t('account.continueGitHub')}
      </Button>
    </div>
  )
}
