/** Desktop Mobile Pairing Settings section and bilingual pre-authorization notice. */

import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { ACCOUNT_PRIVACY_NOTICE } from '@deepseek-ai/dsh-platform-account/privacy'
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
      <p lang="zh-CN">{ACCOUNT_PRIVACY_NOTICE.zh}</p>
      <p lang="en">{ACCOUNT_PRIVACY_NOTICE.en}</p>
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
