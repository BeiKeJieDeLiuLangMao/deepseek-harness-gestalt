/** Persistent Browser occurrence data shared by the iframe and Workspace implementations. */
import type { BrowserTarget, BrowserWorkspaceCreateRemoteRequest } from '@deepseek-ai/dsh-browser-workspace/client'
import type { SidebarRightSettingDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

/** Official Browser page kind. */
export const OFFICIAL_BROWSER_KIND = 'browser'

/** Stable definition id of the Browser fallback. */
export const OFFICIAL_BROWSER_FALLBACK_ID = '@deepseek-ai/dsh-client-ui-better-sidebar/browser'

/** JSON form of a Browser Profile selection. */
export type OfficialBrowserProfile =
  | { readonly kind: 'temporary' }
  | { readonly kind: 'shared' }
  | { readonly kind: 'persistent'; readonly name: string }

/** Durable state retained by one Browser occurrence. */
export type OfficialBrowserPayload = {
  readonly target?: {
    readonly profileId: string
    readonly workspaceId: string
    readonly browserId: string
    readonly tabId: string
  }
  readonly profile?: OfficialBrowserProfile
  readonly url?: string
  readonly createError?: string
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabPayloadMap {
    browser: OfficialBrowserPayload
  }
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Parse a durable Browser payload. */
export function officialBrowserPayloadOf(value: unknown): OfficialBrowserPayload | undefined {
  if (value === undefined) return {}
  const record = recordOf(value)
  if (record === undefined) return undefined
  const targetRecord = recordOf(record.target)
  let target: OfficialBrowserPayload['target']
  if (targetRecord !== undefined) {
    if (
      typeof targetRecord.profileId !== 'string' || targetRecord.profileId === ''
      || typeof targetRecord.workspaceId !== 'string' || targetRecord.workspaceId === ''
      || typeof targetRecord.browserId !== 'string' || targetRecord.browserId === ''
      || typeof targetRecord.tabId !== 'string' || targetRecord.tabId === ''
    ) return undefined
    target = {
      profileId: targetRecord.profileId,
      workspaceId: targetRecord.workspaceId,
      browserId: targetRecord.browserId,
      tabId: targetRecord.tabId,
    }
  } else if (record.target !== undefined) {
    return undefined
  }
  const profileRecord = recordOf(record.profile)
  let profile: OfficialBrowserProfile | undefined
  if (profileRecord !== undefined) {
    if (profileRecord.kind === 'temporary' || profileRecord.kind === 'shared') {
      profile = { kind: profileRecord.kind }
    } else if (
      profileRecord.kind === 'persistent'
      && typeof profileRecord.name === 'string'
      && profileRecord.name !== ''
    ) {
      profile = { kind: 'persistent', name: profileRecord.name }
    } else {
      return undefined
    }
  } else if (record.profile !== undefined) {
    return undefined
  }
  if (record.url !== undefined && typeof record.url !== 'string') return undefined
  if (record.createError !== undefined && typeof record.createError !== 'string') return undefined
  return {
    ...(target === undefined ? {} : { target }),
    ...(profile === undefined ? {} : { profile }),
    ...(typeof record.url === 'string' && record.url !== '' ? { url: record.url } : {}),
    ...(typeof record.createError === 'string' && record.createError !== ''
      ? { createError: record.createError }
      : {}),
  }
}

/** Convert a stored target back to the branded Browser Runtime identity. */
export function officialBrowserTargetOf(value: unknown): BrowserTarget | undefined {
  return officialBrowserPayloadOf(value)?.target as BrowserTarget | undefined
}

/** Stable Browser page identity used for dedupe and official page addresses. */
export function officialBrowserTargetKey(target: NonNullable<OfficialBrowserPayload['target']>): string {
  return `${target.profileId}/${target.workspaceId}/${target.browserId}/${target.tabId}`
}

/** Convert a selected Profile into the Browser Workspace create request. */
export function officialBrowserCreateRequest(
  profile: OfficialBrowserProfile | undefined,
  fallback: () => BrowserWorkspaceCreateRemoteRequest,
): BrowserWorkspaceCreateRemoteRequest {
  if (profile === undefined) return fallback()
  if (profile.kind === 'persistent') return { profile: 'persistent', name: profile.name }
  return { profile: profile.kind }
}

/** Browser preferences rendered by either implementation's official descriptor. */
export function officialBrowserSettings(copy: (key: string) => string): readonly SidebarRightSettingDefinition[] {
  return [{
    key: 'browserNoSandbox', source: 'preference', title: () => copy('settingsBrowserSandboxTitle'),
    description: () => copy('settingsBrowserSandboxDesc'), unsafe: true,
  }, {
    key: 'browserInterceptLinks', source: 'preference', title: () => copy('settingsBrowserLinksTitle'),
    description: () => copy('settingsBrowserLinksDesc'),
  }, {
    key: 'browserInterceptHttp', source: 'preference', title: () => copy('settingsBrowserHttpTitle'),
    description: () => copy('settingsBrowserHttpDesc'),
  }, {
    key: 'browserInterceptHttps', source: 'preference', title: () => copy('settingsBrowserHttpsTitle'),
    description: () => copy('settingsBrowserHttpsDesc'),
  }, {
    key: 'browserAllowedLoopback', source: 'preference', control: 'text',
    title: () => copy('settingsBrowserLoopbackTitle'),
    description: () => copy('settingsBrowserLoopbackDesc'),
    placeholder: copy('settingsBrowserLoopbackPlaceholder'),
  }]
}
