import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  IndexedDbInstallationAccountStore,
  PlatformAccountHttpTransport,
  PlatformAccountInstallation,
  type PlatformOrigins,
} from '@deepseek-ai/dsh-platform-account-client'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/gradient-shadow-text.css'
import { MobileAccount } from './MobileAccount.tsx'
import './root.css'

const environment = import.meta.env.VITE_PLATFORM_ENV === 'production' ? 'production' : 'development'
const origins: PlatformOrigins = {
  development: import.meta.env.VITE_PLATFORM_DEVELOPMENT_ORIGIN ?? 'https://platform.dev.invalid',
  production: import.meta.env.VITE_PLATFORM_PRODUCTION_ORIGIN ?? 'https://platform.invalid',
}
const installationIdKey = `deepseek-gestalt:${environment}:mobile-installation-id`
let installationId = localStorage.getItem(installationIdKey)
if (installationId === null) {
  installationId = crypto.randomUUID()
  localStorage.setItem(installationIdKey, installationId)
}
const installation = new PlatformAccountInstallation({
  environment,
  installationId,
  installationKind: 'mobile',
  transport: new PlatformAccountHttpTransport({ environment, origins }),
  store: new IndexedDbInstallationAccountStore(),
  openSystemBrowser(url) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (opened === null) throw new Error('System browser could not be opened')
  },
})

const root = document.getElementById('root')
if (root === null) throw new Error('mobile app: missing #root')
createRoot(root).render(
  <StrictMode>
    <MobileAccount installation={installation} />
  </StrictMode>,
)
