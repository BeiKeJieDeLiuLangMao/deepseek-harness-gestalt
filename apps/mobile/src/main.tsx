import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  IndexedDbInstallationAccountStore,
  PlatformAccountHttpTransport,
  PlatformAccountInstallation,
} from '@deepseek-ai/dsh-platform-account-client'
import { loadPlatformEnvironment, parseInstallationId } from '@deepseek-ai/dsh-platform-account'
import { RemoteAccessHttpTransport } from '@deepseek-ai/dsh-remote-access-client'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/gradient-shadow-text.css'
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
}
if (environment.environment === 'development' && import.meta.env.VITE_PERSONAL_PAIRING_KEYLESS === '1') {
  const { DevelopmentKeylessMobileHandshakeClient } = await import('./development-keyless-pairing.ts')
  pairing = new MobilePairingController({
    installation,
    transport: new RemoteAccessHttpTransport({ environment }),
    handshake: new DevelopmentKeylessMobileHandshakeClient(),
    scanner: new NativeMobilePairingQrScanner(),
    device: {
      name: navigator.userAgent.includes('Android') ? 'Android phone' : 'iPhone',
      platform: navigator.userAgent.includes('Android') ? 'android' : 'ios',
    },
  })
}

const root = document.getElementById('root')
if (root === null) throw new Error('mobile app: missing #root')
createRoot(root).render(
  <StrictMode>
    <MobileAccount installation={installation} pairing={pairing} />
  </StrictMode>,
)
