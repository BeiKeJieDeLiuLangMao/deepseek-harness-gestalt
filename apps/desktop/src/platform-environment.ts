import { loadOperatedPlatformEnvironment, type SelectedPlatformEnvironment } from '@deepseek-ai/dsh-platform-account'

/** Parse the operated Desktop deployment identity before window or network startup. */
export function loadDesktopPlatformEnvironment(source: NodeJS.ProcessEnv): SelectedPlatformEnvironment {
  rejectLegacySelection(source.DSH_PLATFORM_ENV)
  return loadOperatedPlatformEnvironment({
    environment: 'production',
    origin: source.DSH_PLATFORM_ORIGIN,
    callbackUrl: source.DSH_PLATFORM_CALLBACK_URL,
    githubClientId: source.DSH_PLATFORM_GITHUB_CLIENT_ID,
    credentialReference: source.DSH_PLATFORM_CREDENTIAL_REFERENCE,
    databaseIdentity: source.DSH_PLATFORM_DATABASE_IDENTITY,
    identityNamespace: source.DSH_PLATFORM_IDENTITY_NAMESPACE,
  })
}

function rejectLegacySelection(selection: string | undefined): void {
  if (selection !== undefined && selection !== '') {
    throw new TypeError('Desktop Platform legacy environment selection is not accepted')
  }
}
