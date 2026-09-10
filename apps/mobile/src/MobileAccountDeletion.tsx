import { useState, type ReactNode } from 'react'
import type { PlatformAccountInstallation, PlatformAccountInstallationSnapshot } from '@deepseek-ai/dsh-platform-account-client'
import { parseAccountDeletionSuccessors } from '@deepseek-ai/dsh-platform-account'
import css from './MobileAccount.module.css'

/** Confirmation and recoverable progress for deletion initiated by this installation. */
export function MobileAccountDeletion({ installation, deletion, locale }: {
  installation: PlatformAccountInstallation
  deletion: NonNullable<PlatformAccountInstallationSnapshot['deletion']>
  locale: 'zh' | 'en'
}): ReactNode {
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const zh = locale === 'zh'
  const confirming = deletion.status === 'confirming'
  const selecting = confirming || deletion.status === 'action-required'
  const selected = deletion.projects.every(project =>
    project.candidates.some(candidate => candidate.membershipId === choices[project.projectId]))
  const submit = (): void => {
    setBusy(true)
    setFailed(false)
    const successors = parseAccountDeletionSuccessors(deletion.projects.map(project => ({ projectId: project.projectId,
      successorMembershipId: choices[project.projectId] })))
    const pending = confirming ? installation.confirmAccountDeletion(successors)
      : installation.retryAccountDeletion(deletion.status === 'action-required' ? successors : undefined)
    void pending.catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
  }
  return <main className={css.page} data-mobile-account-deletion={deletion.status} lang={zh ? 'zh-CN' : 'en'}>
    <section className={css.accountPage} role={confirming ? 'dialog' : 'region'} aria-modal={confirming || undefined} aria-labelledby="deletion-title">
      <h1 id="deletion-title">{zh ? '删除账号' : 'Delete account'}</h1>
      {confirming && <p>{zh
        ? '这将永久删除你的云端账号和个人资料，撤销所有设备的登录与配对，并清除云端加密附件和本机属于此账号的配对密钥、缓存。桌面端本地工作区文件及其他成员的数据会保留。此操作无法撤销。'
        : 'This permanently deletes your cloud account and profile, revokes sign-in and pairing on every device, and clears cloud encrypted attachments and this account’s pairing keys and caches on this device. Desktop workspace files and other members’ data are retained. This cannot be undone.'}</p>}
      {deletion.status === 'action-required' && <p>{zh ? '之前选择的接任成员已不可用。账号访问已撤销，请选择新的所有者以继续删除。' : 'A selected successor is unavailable. Account access has been revoked. Choose another owner to continue deletion.'}</p>}
      {selecting && deletion.projects.map(project => <label key={project.projectId} className={css.languageSetting}>
        <span>{project.name} — {zh ? '新所有者' : 'New owner'}</span>
        <select aria-label={`${project.name} ${zh ? '新所有者' : 'New owner'}`} value={choices[project.projectId] ?? ''}
          onChange={(event) => { setChoices({ ...choices, [project.projectId]: event.target.value }) }} disabled={busy}>
          <option value="">{zh ? '请选择已加入的成员' : 'Select a joined member'}</option>
          {project.candidates.map(candidate =>
            <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.label}</option>)}
        </select>
      </label>)}
      {deletion.status === 'deleting' && <p role="status">{zh ? '正在删除。可以关闭应用，重新打开后会继续恢复进度。' : 'Deletion is in progress. You can close the app and recover progress when you reopen it.'}</p>}
      {(deletion.status === 'retry' || failed) && <p role="alert">{zh ? '删除尚未完成。请重试以查看进度并继续清理。' : 'Deletion is not complete. Retry to check progress and continue cleanup.'}</p>}
      {deletion.status === 'complete' && <>
        <p role="status">{zh ? '账号已删除，本机清理已完成。' : 'Your account is deleted and cleanup on this device is complete.'}</p>
        <button className={css.secondary} type="button" onClick={() => { installation.dismissAccountDeletion() }}>{zh ? '返回登录' : 'Return to sign-in'}</button>
      </>}
      {deletion.status !== 'complete' && <button className={css.secondary} type="button" disabled={busy || (selecting && !selected)} onClick={submit}>
        {busy ? (zh ? '请稍候…' : 'Please wait…') : confirming ? (zh ? '永久删除账号' : 'Permanently delete account') : (zh ? '继续删除' : 'Continue deletion')}
      </button>}
      {confirming && <button className={css.secondary} type="button" disabled={busy} onClick={() => { installation.cancelAccountDeletion() }}>{zh ? '取消' : 'Cancel'}</button>}
    </section>
  </main>
}
