import { loadPlatformEnvironment, type SelectedPlatformEnvironment } from '@deepseek-ai/dsh-platform-account'

/** Parse the complete Desktop deployment pair before window or network startup. */
export function loadDesktopPlatformEnvironment(source: NodeJS.ProcessEnv): SelectedPlatformEnvironment {
  return loadPlatformEnvironment({
    selection: source.DSH_PLATFORM_ENV,
    development: {
      origin: source.DSH_PLATFORM_DEVELOPMENT_ORIGIN,
      callbackUrl: source.DSH_PLATFORM_DEVELOPMENT_CALLBACK_URL,
      githubClientId: source.DSH_PLATFORM_DEVELOPMENT_GITHUB_CLIENT_ID,
      credentialReference: source.DSH_PLATFORM_DEVELOPMENT_CREDENTIAL_REFERENCE,
      databaseIdentity: source.DSH_PLATFORM_DEVELOPMENT_DATABASE_IDENTITY,
      identityNamespace: source.DSH_PLATFORM_DEVELOPMENT_IDENTITY_NAMESPACE,
    },
    production: {
      origin: source.DSH_PLATFORM_PRODUCTION_ORIGIN,
      callbackUrl: source.DSH_PLATFORM_PRODUCTION_CALLBACK_URL,
      githubClientId: source.DSH_PLATFORM_PRODUCTION_GITHUB_CLIENT_ID,
      credentialReference: source.DSH_PLATFORM_PRODUCTION_CREDENTIAL_REFERENCE,
      databaseIdentity: source.DSH_PLATFORM_PRODUCTION_DATABASE_IDENTITY,
      identityNamespace: source.DSH_PLATFORM_PRODUCTION_IDENTITY_NAMESPACE,
    },
  })
}
