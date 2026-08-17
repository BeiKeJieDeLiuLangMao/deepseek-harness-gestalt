/** Desktop Host ownership for Settings-only Personal Pairing projection. */

import type { DesktopPairingSnapshot } from '@deepseek-ai/dsh-client-ui-desktop/protocol'

/** Host verbs exposed to the Mobile Pairing Settings section. */
export interface DesktopPairingActions {
  /** Read the current Settings projection. */
  getSnapshot(): DesktopPairingSnapshot
  /** Enable or disable Mobile Access. */
  setEnabled(enabled: boolean): Promise<DesktopPairingSnapshot>
  /** Create one two-minute invitation. */
  createChallenge(): Promise<DesktopPairingSnapshot>
  /** Cancel the active invitation. */
  cancelChallenge(): Promise<DesktopPairingSnapshot>
  /** Confirm matching words for one pending handshake. */
  confirm(pendingPairingId: string): Promise<DesktopPairingSnapshot>
  /** Reject one pending handshake. */
  reject(pendingPairingId: string): Promise<DesktopPairingSnapshot>
  /** Subscribe to Host-owned projection changes. */
  subscribe(listener: (snapshot: DesktopPairingSnapshot) => void): () => void
  /** Drain lifecycle work during Desktop shutdown. */
  dispose(): Promise<void>
}

/**
 * Fail-closed controller used until the independently reviewed Noise adapter is available.
 * Mobile Access remains disabled and no invitation capability is created.
 */
export class UnavailableDesktopPairingController implements DesktopPairingActions {
  private readonly snapshot: DesktopPairingSnapshot

  /** @param reason - exact unavailable reason shown only inside Settings. */
  constructor(reason: string) {
    this.snapshot = { status: 'unavailable', enabled: false, pairings: [], error: reason }
  }

  getSnapshot(): DesktopPairingSnapshot { return this.snapshot }
  setEnabled(_enabled: boolean): Promise<DesktopPairingSnapshot> { return Promise.resolve(this.snapshot) }
  createChallenge(): Promise<DesktopPairingSnapshot> { return Promise.resolve(this.snapshot) }
  cancelChallenge(): Promise<DesktopPairingSnapshot> { return Promise.resolve(this.snapshot) }
  confirm(_pendingPairingId: string): Promise<DesktopPairingSnapshot> { return Promise.resolve(this.snapshot) }
  reject(_pendingPairingId: string): Promise<DesktopPairingSnapshot> { return Promise.resolve(this.snapshot) }
  subscribe(_listener: (snapshot: DesktopPairingSnapshot) => void): () => void { return () => {} }
  dispose(): Promise<void> { return Promise.resolve() }
}
