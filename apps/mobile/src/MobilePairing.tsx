import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import css from './MobilePairing.module.css'
import type { MobilePairingActions } from './personal-pairing-model.ts'

export type { MobilePairingActions } from './personal-pairing-model.ts'

/**
 * Same-account Mobile pairing flow shown after Platform Account sign-in.
 * @param props.actions - current pairing adapter.
 * @param props.manageLifecycle - when true, this view activates and deactivates the adapter.
 * @param props.onBack - returns to the signed-in home screen.
 * @returns Settings-like Mobile flow for QR/link completion and word comparison.
 */
export function MobilePairing({
  actions,
  manageLifecycle = true,
  onBack,
}: {
  actions: MobilePairingActions
  manageLifecycle?: boolean
  onBack?: () => void
}): ReactNode {
  const snapshot = useSyncExternalStore(
    listener => actions.subscribe(listener),
    () => actions.getSnapshot(),
  )
  const [link, setLink] = useState('')
  useEffect(() => {
    if (!manageLifecycle) return
    void actions.activate()
    return () => { void actions.deactivate() }
  }, [actions, manageLifecycle])

  if (snapshot.status === 'unavailable') {
    return (
      <section className={css.cover} data-mobile-pairing="unavailable">
        {onBack !== undefined && (
          <button type="button" className={css.back} onClick={onBack}>返回</button>
        )}
        <h2>Personal Pairing</h2>
        <p role="alert">{snapshot.error}</p>
      </section>
    )
  }
  if (snapshot.status === 'retryable') {
    return (
      <section className={css.cover} data-mobile-pairing="retryable">
        {onBack !== undefined && (
          <button type="button" className={css.back} onClick={onBack}>返回</button>
        )}
        <div className={css.mark} aria-hidden="true">!</div>
        <h2>配对尚未完成</h2>
        <p role="alert">{snapshot.error}</p>
        <button type="button" className={css.continue} onClick={() => { void actions.retryPairing() }}>重试配对</button>
        <small>重试会复用同一个一次性邀请和握手，不会创建新的设备权限。</small>
      </section>
    )
  }
  if (snapshot.status === 'pending') {
    return (
      <section className={css.cover} data-mobile-pairing="pending">
        {onBack !== undefined && (
          <button type="button" className={css.back} onClick={onBack}>返回</button>
        )}
        <div className={css.mark} aria-hidden="true">···</div>
        <h2>核对认证词</h2>
        <p>手机与 Desktop 必须显示完全相同的词。</p>
        <output>{snapshot.authenticationWords.join(' ')}</output>
        <strong>请在 Desktop 确认后继续</strong>
      </section>
    )
  }
  if (snapshot.status === 'paired') {
    return (
      <section className={css.paired} data-mobile-pairing="paired">
        {onBack !== undefined && (
          <button type="button" className={css.back} onClick={onBack}>返回</button>
        )}
        <h2>已配对</h2>
        <p>只要 Desktop 窗口保持打开，就可以从任意网络继续工作。</p>
        <button type="button" className={css.continue} onClick={() => { void actions.unpair() }}>解除配对</button>
      </section>
    )
  }
  return (
    <section className={css.cover} data-mobile-pairing={snapshot.status}>
      {onBack !== undefined && (
        <button type="button" className={css.back} onClick={onBack}>返回</button>
      )}
      <div className={css.mark} aria-hidden="true">▦</div>
      <h2>连接到你的 Desktop</h2>
      {snapshot.status !== 'ready' || snapshot.error === undefined ? null : <p role="alert">{snapshot.error}</p>}
      <p>扫描 Desktop「设置 → 手机配对」中显示的一次性二维码，或粘贴同一个完整链接。</p>
      <button type="button" className={css.scan} onClick={() => { void actions.scanQr() }}>扫描 QR</button>
      <label>
        <span>完整的一次性配对链接</span>
        <input type="url" value={link} onChange={(event) => { setLink(event.target.value) }} />
      </label>
      <button
        type="button"
        className={css.continue}
        disabled={link === '' || snapshot.status === 'completing'}
        onClick={() => { void actions.completeLink(link) }}
      >继续配对</button>
      <small>不提供短码；Desktop 明确确认前不会获得访问权限。</small>
    </section>
  )
}
