import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import css from './MobilePairing.module.css'

/** Mobile Personal Pairing presentation state. */
type MobilePairingSnapshot =
  | { status: 'ready' }
  | { status: 'completing' }
  | {
    status: 'pending'
    deviceName: string
    authenticationWords: readonly [string, string, string, string, string, string]
  }
  | { status: 'paired'; desktopName: string }
  | { status: 'unavailable'; error: string }

/** Mobile adapter for full-link/QR completion and handshake state. */
export interface MobilePairingActions {
  /** Read the current pairing state, preserving object identity until a transition. */
  getSnapshot(): MobilePairingSnapshot
  /** Subscribe to pairing transitions. */
  subscribe(listener: () => void): () => void
  /** Complete the exact high-entropy link produced by Desktop. */
  completeLink(link: string): void | Promise<void>
  /** Open the native QR scanner and complete its exact payload. */
  scanQr(): void | Promise<void>
}

/**
 * Same-account Mobile pairing flow shown after Platform Account sign-in.
 * @param props - current pairing adapter.
 * @returns Settings-like Mobile flow for QR/link completion and word comparison.
 */
export function MobilePairing({ actions }: { actions: MobilePairingActions }): ReactNode {
  const snapshot = useSyncExternalStore(
    listener => actions.subscribe(listener),
    () => actions.getSnapshot(),
  )
  const [link, setLink] = useState('')

  if (snapshot.status === 'unavailable') {
    return <section className={css.card}><h2>Personal Pairing</h2><p role="alert">{snapshot.error}</p></section>
  }
  if (snapshot.status === 'pending') {
    return (
      <section className={css.card} data-mobile-pairing="pending">
        <h2>核对认证词</h2>
        <p>手机与 Desktop 必须显示完全相同的词。</p>
        <output>{snapshot.authenticationWords.join(' ')}</output>
        <strong>请在 Desktop 确认后继续</strong>
      </section>
    )
  }
  if (snapshot.status === 'paired') {
    return <section className={css.card}><h2>已配对</h2><p>{snapshot.desktopName}</p></section>
  }
  return (
    <section className={css.card} data-mobile-pairing={snapshot.status}>
      <h2>连接 Paired Desktop</h2>
      <p>扫描 Desktop Settings 中的 QR，或粘贴同一个完整的一次性链接。</p>
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
