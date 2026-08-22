import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  IndexedDbInstallationAccountStore,
  PlatformAccountHttpTransport,
  PlatformAccountInstallation,
} from '@deepseek-ai/dsh-platform-account-client'
import { loadPlatformEnvironment, parseInstallationId } from '@deepseek-ai/dsh-platform-account'
import {
  BrowserRelayEndpointSocket,
  MobileRelayEndpointLifecycle,
  RemoteAccessHttpTransport,
} from '@deepseek-ai/dsh-remote-access-client'
import { parseRelayAttachmentId, REMOTE_PROTOCOL_LIMITS } from '@deepseek-ai/dsh-remote-protocol'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/gradient-shadow-text.css'
import {
  bindCompanionProcessVisibility,
  CompanionForegroundRuntime,
  companionRuntime,
  installCompanionRuntime,
} from './companion-lifecycle.ts'
import { MobileAccount } from './MobileAccount.tsx'
import type { MobilePairingActions } from './MobilePairing.tsx'
import { MobilePairingController, NativeMobilePairingQrScanner } from './personal-pairing.ts'
import { mobileSystemBrowser } from './system-browser.ts'
import './root.css'

const environment = loadPlatformEnvironment({
  selection: import.meta.env.VITE_PLATFORM_ENV,
  development: {
    origin: import.meta.env.VITE_PLATFORM_DEVELOPMENT_ORIGIN,
    callbackUrl: import.meta.env.VITE_PLATFORM_DEVELOPMENT_CALLBACK_URL,
    githubClientId: import.meta.env.VITE_PLATFORM_DEVELOPMENT_GITHUB_CLIENT_ID,
    credentialReference: import.meta.env.VITE_PLATFORM_DEVELOPMENT_CREDENTIAL_REFERENCE,
    databaseIdentity: import.meta.env.VITE_PLATFORM_DEVELOPMENT_DATABASE_IDENTITY,
    identityNamespace: import.meta.env.VITE_PLATFORM_DEVELOPMENT_IDENTITY_NAMESPACE,
  },
  production: {
    origin: import.meta.env.VITE_PLATFORM_PRODUCTION_ORIGIN,
    callbackUrl: import.meta.env.VITE_PLATFORM_PRODUCTION_CALLBACK_URL,
    githubClientId: import.meta.env.VITE_PLATFORM_PRODUCTION_GITHUB_CLIENT_ID,
    credentialReference: import.meta.env.VITE_PLATFORM_PRODUCTION_CREDENTIAL_REFERENCE,
    databaseIdentity: import.meta.env.VITE_PLATFORM_PRODUCTION_DATABASE_IDENTITY,
    identityNamespace: import.meta.env.VITE_PLATFORM_PRODUCTION_IDENTITY_NAMESPACE,
  },
})
const installationIdKey = `deepseek-gestalt:${environment.identityNamespace}:mobile-installation-id`
let installationId = localStorage.getItem(installationIdKey)
if (installationId === null) {
  if (typeof crypto.randomUUID !== 'function') {
    throw new TypeError('Mobile requires a secure browsing context (HTTPS or http://127.0.0.1) to create an Installation id')
  }
  installationId = crypto.randomUUID()
  localStorage.setItem(installationIdKey, installationId)
}
const parsedInstallationId = parseInstallationId(installationId)
const installation = new PlatformAccountInstallation({
  environment,
  installationId: parsedInstallationId,
  installationKind: 'mobile',
  transport: new PlatformAccountHttpTransport({ environment }),
  store: new IndexedDbInstallationAccountStore(`deepseek-gestalt-platform-account:${environment.databaseIdentity}`),
  systemBrowser: mobileSystemBrowser,
})
let companionVisibilityDisposer: (() => Promise<void>) | undefined

/**
 * Remove the process-lifetime visibility listeners bound by the Mobile entry.
 * @returns settled after document listeners and a pending Capacitor handle are removed.
 */
export function disposeCompanionVisibility(): Promise<void> {
  return companionVisibilityDisposer?.() ?? Promise.resolve()
}

const unavailablePairing = {
  status: 'unavailable',
  error: 'Personal Pairing waits for the independent Noise security review.',
} as const
const pairingUnavailable = (): Promise<never> => Promise.reject(new Error(unavailablePairing.error))
let pairing: MobilePairingActions = {
  getSnapshot: () => unavailablePairing,
  subscribe: () => () => {},
  completeLink: pairingUnavailable,
  scanQr: pairingUnavailable,
  retryPairing: pairingUnavailable,
  activate: () => Promise.resolve(),
  deactivate: () => Promise.resolve(),
  unpair: pairingUnavailable,
}
if (environment.environment === 'development' && import.meta.env.VITE_PERSONAL_PAIRING_KEYLESS === '1') {
  const { DevelopmentKeylessMobileHandshakeClient } = await import('./development-keyless-pairing.ts')
  const { PairingCompanionKeyVault } = await import('./companion-keys.ts')
  const relayUrl = requiredWss(import.meta.env.VITE_REMOTE_RELAY_WSS_URL)
  const inboundMaxBytes = positiveInteger(import.meta.env.VITE_REMOTE_RELAY_INBOUND_MAX_BYTES, 'inbound bytes')
  const inboundMaxMessages = positiveInteger(import.meta.env.VITE_REMOTE_RELAY_INBOUND_MAX_MESSAGES, 'inbound messages')
  if (inboundMaxBytes < REMOTE_PROTOCOL_LIMITS.relayMessageBytes) {
    throw new TypeError('Mobile Relay inbound bytes must admit one maximum Relay message')
  }
  const relay = new MobileRelayEndpointLifecycle({
    attachmentId: () => parseRelayAttachmentId(crypto.randomUUID()),
    connect: async signal => await BrowserRelayEndpointSocket.connect(relayUrl, signal, {
      maxBytes: inboundMaxBytes,
      maxMessages: inboundMaxMessages,
    }),
    attachTimeoutMs: positiveInteger(import.meta.env.VITE_REMOTE_RELAY_ATTACH_TIMEOUT_MS, 'attach timeout'),
    heartbeatIntervalMs: positiveInteger(import.meta.env.VITE_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS, 'heartbeat interval'),
    reconnectDelayMs: positiveInteger(import.meta.env.VITE_REMOTE_RELAY_RECONNECT_DELAY_MS, 'reconnect delay'),
    onConnectionReady: () => { companionRuntime()?.markConnectionOpen() },
    onConnectionLost: () => { companionRuntime()?.forgetConnection() },
    onTransportError: () => { companionRuntime()?.forgetConnection() },
  })
  const companion = new CompanionForegroundRuntime({ relay })
  installCompanionRuntime(companion)
  companionVisibilityDisposer = bindCompanionProcessVisibility(companion)
  pairing = new MobilePairingController({
    installation,
    transport: new RemoteAccessHttpTransport({ environment }),
    handshake: new DevelopmentKeylessMobileHandshakeClient(),
    scanner: new NativeMobilePairingQrScanner(),
    relay: companion,
    companion,
    pairingKeys: new PairingCompanionKeyVault(),
    device: {
      name: navigator.userAgent.includes('Android') ? 'Android phone' : 'iPhone',
      platform: navigator.userAgent.includes('Android') ? 'android' : 'ios',
    },
  })
}

function positiveInteger(value: unknown, name: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`Mobile Relay ${name} must be a positive integer`)
  return parsed
}

function requiredWss(value: unknown): string {
  if (typeof value !== 'string' || new URL(value).protocol !== 'wss:') throw new TypeError('Mobile Relay endpoint must use WSS')
  return value
}

const root = document.getElementById('root')
if (root === null) throw new Error('mobile app: missing #root')
createRoot(root).render(
  <StrictMode>
    <MobileAccount installation={installation} pairing={pairing} />
  </StrictMode>,
)
