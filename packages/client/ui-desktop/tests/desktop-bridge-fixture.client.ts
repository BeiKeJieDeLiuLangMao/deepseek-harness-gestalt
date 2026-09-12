/**
 * Shared `DesktopBridge` preload fixture for assembled Desktop Web E2E.
 * Account state is inert; chrome requests and replies are delivered locally.
 * Playwright serializes `installDesktopBridgeFixture` into the page, so the
 * function body must stay free of imported values.
 */

import type {
  ChromeOverlayShowRequest,
  ChromeOverlayResult,
  DesktopAccountSnapshot,
  DesktopBridge,
  DesktopPairingSnapshot,
  DesktopAccountPoolSnapshot,
  UpdaterStatus,
} from '../src/protocol.ts'

/**
 * Install a complete inert Desktop Host preload on `globalThis`.
 * Account, Pairing, and account-pool subscriptions deliver the pre-answer snapshot
 * immediately; unsubscribe removes the listener so later inert verbs do not
 * notify it.
 * @param platform - Node `process.platform` projected into Window Chrome.
 * @returns the installed bridge, typed as the current `DesktopBridge`.
 */
export function installDesktopBridgeFixture(platform: 'darwin' | 'win32'): DesktopBridge {
  const updater: UpdaterStatus = { state: 'disabled', lastCheckedAt: null }
  const account: DesktopAccountSnapshot = { status: 'unavailable', privacyAccepted: false }
  const pairing: DesktopPairingSnapshot = { status: 'unavailable', enabled: false, pairings: [] }
  const accountPool: DesktopAccountPoolSnapshot = { state: 'starting', accounts: [] }
  let overlay: ChromeOverlayShowRequest | null = null
  const overlayListeners = new Set<(state: ChromeOverlayShowRequest | null) => void>()
  const overlayResultListeners = new Set<(result: ChromeOverlayResult) => void>()
  const publishOverlay = (state: ChromeOverlayShowRequest | null): void => {
    overlay = state
    for (const listener of overlayListeners) listener(state)
  }
  const statusListeners = new Set<(status: UpdaterStatus) => void>()
  const accountListeners = new Set<(snapshot: DesktopAccountSnapshot) => void>()
  const pairingListeners = new Set<(snapshot: DesktopPairingSnapshot) => void>()
  const accountPoolListeners = new Set<(snapshot: DesktopAccountPoolSnapshot) => void>()

  const notifyStatus = (status: UpdaterStatus): void => {
    for (const listener of statusListeners) listener(status)
  }
  const notifyAccount = (snapshot: DesktopAccountSnapshot): void => {
    for (const listener of accountListeners) listener(snapshot)
  }
  const notifyPairing = (snapshot: DesktopPairingSnapshot): void => {
    for (const listener of pairingListeners) listener(snapshot)
  }
  const notifyAccountPool = (snapshot: DesktopAccountPoolSnapshot): void => {
    for (const listener of accountPoolListeners) listener(snapshot)
  }

  const bridge: DesktopBridge = {
    platform,
    getStatus: async () => updater,
    checkNow: () => { notifyStatus(updater) },
    downloadNow: () => {},
    quitAndInstall: () => {},
    onStatus: (listener) => {
      statusListeners.add(listener)
      return () => { statusListeners.delete(listener) }
    },
    windowMinimize: () => {},
    windowMaximize: () => {},
    windowClose: () => {},
    accountGetSnapshot: async () => account,
    accountAcceptPrivacy: async () => {
      notifyAccount(account)
      return account
    },
    accountBeginLogin: async () => {
      notifyAccount(account)
      return account
    },
    accountCancelLogin: async () => {
      notifyAccount(account)
      return account
    },
    accountSignOut: async () => {
      notifyAccount(account)
      return account
    },
    accountRefreshMobileInstallations: async () => {
      notifyAccount(account)
      return account
    },
    accountRevokeMobileInstallation: async () => {
      notifyAccount(account)
      return account
    },
    onAccountSnapshot: (listener) => {
      accountListeners.add(listener)
      listener(account)
      return () => { accountListeners.delete(listener) }
    },
    pairingGetSnapshot: async () => pairing,
    pairingSetEnabled: async () => {
      notifyPairing(pairing)
      return pairing
    },
    pairingCreateChallenge: async () => {
      notifyPairing(pairing)
      return pairing
    },
    pairingCancelChallenge: async () => {
      notifyPairing(pairing)
      return pairing
    },
    pairingConfirm: async () => {
      notifyPairing(pairing)
      return pairing
    },
    pairingReject: async () => {
      notifyPairing(pairing)
      return pairing
    },
    pairingRevoke: async () => {
      notifyPairing(pairing)
      return pairing
    },
    onPairingSnapshot: (listener) => {
      pairingListeners.add(listener)
      listener(pairing)
      return () => { pairingListeners.delete(listener) }
    },
    accountPoolGetSnapshot: async () => accountPool,
    accountPoolRefresh: async () => {
      notifyAccountPool(accountPool)
      return accountPool
    },
    accountPoolSetEnabled: async () => accountPool,
    accountPoolDelete: async () => accountPool,
    accountPoolStartLogin: async kind => ({ kind, flow: kind === 'glm' ? 'glm-key' : kind === 'kimi' || kind === 'xai' ? 'device' : 'pkce' }),
    accountPoolLoginStatus: async () => accountPool,
    accountPoolCancelLogin: async () => accountPool,
    accountPoolSubmitGlmKey: async () => accountPool,
    accountPoolRefreshQuota: async () => accountPool,
    onAccountPoolSnapshot: (listener) => {
      accountPoolListeners.add(listener)
      listener(accountPool)
      return () => { accountPoolListeners.delete(listener) }
    },
    chromeOverlayShow: async (request) => { publishOverlay(request) },
    chromeOverlayHide: async () => { publishOverlay(null) },
    chromeOverlayGetState: async () => overlay,
    chromeOverlayResult: (result) => {
      publishOverlay(null)
      for (const listener of overlayResultListeners) listener(result)
    },
    onChromeOverlayState: (listener) => {
      overlayListeners.add(listener)
      return () => { overlayListeners.delete(listener) }
    },
    onChromeOverlayResult: (listener) => {
      overlayResultListeners.add(listener)
      return () => { overlayResultListeners.delete(listener) }
    },
  }

  Object.defineProperty(globalThis, 'dshDesktop', {
    configurable: true,
    value: bridge,
  })
  return bridge
}
