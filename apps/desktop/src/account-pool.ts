/**
 * Host-private CLIProxyAPI account-pool gateway.
 * Renderer receives redacted snapshots and narrow intents only.
 */
import { createQuotaObserver, type QuotaObservation, type QuotaObservationTransport, type QuotaProvider } from '@deepseek-ai/dsh-cliproxy-quota'
import type { CLIProxyAPISupervisor } from './cliproxyapi-runtime.ts'
import type {
  AccountPoolLoginKind,
  AccountPoolLoginStart,
  DesktopAccountPoolAccount,
  DesktopAccountPoolQuotaWindow,
  DesktopAccountPoolSnapshot,
} from '@deepseek-ai/dsh-client-ui-desktop/protocol'

const LOGIN_PATH: Record<Exclude<AccountPoolLoginKind, 'glm'>, string> = {
  anthropic: '/v0/management/anthropic-auth-url',
  codex: '/v0/management/codex-auth-url',
  antigravity: '/v0/management/antigravity-auth-url',
  kimi: '/v0/management/kimi-auth-url',
  xai: '/v0/management/xai-auth-url',
}

const PROVIDER_TO_QUOTA: Record<string, QuotaProvider> = {
  anthropic: 'claude',
  claude: 'claude',
  codex: 'codex',
  antigravity: 'antigravity',
  kimi: 'kimi',
  xai: 'xai',
  glm: 'glm',
}

export interface DesktopAccountPoolActions {
  readonly getSnapshot: () => DesktopAccountPoolSnapshot
  readonly refresh: () => Promise<DesktopAccountPoolSnapshot>
  readonly setEnabled: (name: string, enabled: boolean) => Promise<DesktopAccountPoolSnapshot>
  readonly deleteAccount: (name: string) => Promise<DesktopAccountPoolSnapshot>
  readonly startLogin: (kind: AccountPoolLoginKind) => Promise<AccountPoolLoginStart>
  readonly loginStatus: (state: string) => Promise<DesktopAccountPoolSnapshot>
  readonly cancelLogin: (state: string) => Promise<DesktopAccountPoolSnapshot>
  readonly submitGlmKey: (
    input: { apiKey: string; site?: string; organization?: string; project?: string },
  ) => Promise<DesktopAccountPoolSnapshot>
  readonly refreshQuota: (authIndex: string) => Promise<DesktopAccountPoolSnapshot>
  readonly subscribe: (listener: (snapshot: DesktopAccountPoolSnapshot) => void) => () => void
}

export function createDesktopAccountPool(options: {
  supervisor: () => CLIProxyAPISupervisor | undefined
  management: () => QuotaObservationTransport | undefined
}): DesktopAccountPoolActions {
  const listeners = new Set<(snapshot: DesktopAccountPoolSnapshot) => void>()
  let snapshot: DesktopAccountPoolSnapshot = Object.freeze({ state: 'starting', accounts: [] })
  const quotas = new Map<string, DesktopAccountPoolQuotaWindow[]>()

  const publish = (next: DesktopAccountPoolSnapshot): DesktopAccountPoolSnapshot => {
    snapshot = Object.freeze(next)
    for (const listener of listeners) listener(snapshot)
    return snapshot
  }

  const core = (): CLIProxyAPISupervisor => {
    const supervisor = options.supervisor()
    if (supervisor === undefined) throw new Error('CLIProxyAPI account pool is unavailable')
    return supervisor
  }

  const requestJson = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ statusCode: number; payload: unknown }> => {
    const response = await core().coreRequest({
      method,
      path,
      ...body === undefined ? {} : { body: JSON.stringify(body) },
    })
    let payload: unknown
    try {
      payload = response.body.length === 0 ? undefined : JSON.parse(response.body) as unknown
    } catch {
      payload = undefined
    }
    return { statusCode: response.statusCode, payload }
  }

  const refreshRoster = async (error?: string): Promise<DesktopAccountPoolSnapshot> => {
    try {
      const { statusCode, payload } = await requestJson('GET', '/v0/management/auth-files')
      if (statusCode < 200 || statusCode >= 300) {
        return publish({
          state: 'error',
          accounts: snapshot.accounts,
          error: readError(payload) ?? `CLIProxyAPI roster answered status ${String(statusCode)}`,
        })
      }
      const accounts = redactAccounts(payload, quotas)
      return publish({
        state: 'ready',
        accounts,
        ...error === undefined ? {} : { error },
        ...snapshot.login === undefined ? {} : { login: snapshot.login },
      })
    } catch (cause) {
      return publish({
        state: 'error',
        accounts: snapshot.accounts,
        error: cause instanceof Error ? cause.message : 'CLIProxyAPI account pool is unavailable',
      })
    }
  }

  return {
    getSnapshot: () => snapshot,
    refresh: () => refreshRoster(),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setEnabled: async (name, enabled) => {
      const { statusCode, payload } = await requestJson('PATCH', '/v0/management/auth-files/status', {
        name, disabled: !enabled,
      })
      if (statusCode < 200 || statusCode >= 300) {
        return refreshRoster(readError(payload) ?? 'Enable or disable did not succeed')
      }
      return refreshRoster()
    },
    deleteAccount: async (name) => {
      const { statusCode, payload } = await requestJson('DELETE', `/v0/management/auth-files?name=${encodeURIComponent(name)}`)
      if (statusCode < 200 || statusCode >= 300) {
        return refreshRoster(readError(payload) ?? 'Delete did not succeed')
      }
      quotas.delete(name)
      return refreshRoster()
    },
    startLogin: async (kind) => {
      if (kind === 'glm') {
        const login = Object.freeze({ kind, flow: 'glm-key' as const })
        publish({ ...snapshot, login })
        return login
      }
      const { statusCode, payload } = await requestJson('GET', LOGIN_PATH[kind])
      const record = asRecord(payload)
      if (statusCode < 200 || statusCode >= 300 || record === undefined) {
        throw new Error(readError(payload) ?? 'Login did not start')
      }
      const flow = kind === 'kimi' || kind === 'xai' ? 'device' as const : 'pkce' as const
      const login: AccountPoolLoginStart = Object.freeze({
        kind,
        flow,
        state: typeof record.state === 'string' ? record.state : '',
        ...typeof record.url === 'string' ? { url: record.url } : {},
        ...typeof record.user_code === 'string' ? { userCode: record.user_code } : {},
        ...typeof record.expires_in === 'number' ? { expiresIn: record.expires_in } : {},
      })
      publish({ ...snapshot, login })
      return login
    },
    loginStatus: async (state) => {
      const { payload } = await requestJson('GET', `/v0/management/get-auth-status?state=${encodeURIComponent(state)}`)
      const record = asRecord(payload)
      const status = typeof record?.status === 'string' ? record.status : 'wait'
      if (status === 'ok') {
        const { login: _login, ...rest } = snapshot
        publish(rest)
        return refreshRoster()
      }
      if (status === 'error') {
        if (snapshot.login === undefined) return snapshot
        return publish({
          ...snapshot,
          login: { ...snapshot.login, error: readError(payload) ?? 'Login failed' },
        })
      }
      return snapshot
    },
    cancelLogin: async (state) => {
      await requestJson('DELETE', `/v0/management/oauth-session?state=${encodeURIComponent(state)}`)
      const { login: _cancelled, ...rest } = snapshot
      return publish(rest)
    },
    submitGlmKey: async (input) => {
      const apiKey = input.apiKey.trim()
      if (apiKey.length === 0) return publish({ ...snapshot, error: 'GLM Coding Plan key is required' })
      const { statusCode, payload } = await requestJson('PUT', '/v0/management/glm-coding-plan', [{
        'api-key': apiKey,
        ...input.site === undefined ? {} : { site: input.site },
        ...input.organization === undefined ? {} : { organization: input.organization },
        ...input.project === undefined ? {} : { project: input.project },
      }])
      if (statusCode < 200 || statusCode >= 300) {
        return publish({ ...snapshot, error: readError(payload) ?? 'GLM Coding Plan key was not accepted' })
      }
      const { login: _glmLogin, ...rest } = snapshot
      publish(rest)
      return refreshRoster()
    },
    refreshQuota: async (authIndex) => {
      const account = snapshot.accounts.find(item => item.authIndex === authIndex)
      const transport = options.management()
      if (account === undefined || transport === undefined) {
        return publish({ ...snapshot, error: 'Quota observation is unavailable' })
      }
      const provider = PROVIDER_TO_QUOTA[account.provider]
      if (provider === undefined) return snapshot
      const observation = await createQuotaObserver({ transport }).observe({
        provider,
        authIndex: authIndex as QuotaObservation['accountRef'],
        ...account.projectId === undefined ? {} : { projectId: account.projectId },
      })
      quotas.set(authIndex, windowsFromObservation(observation))
      return refreshRoster()
    },
  }
}

function redactAccounts(
  payload: unknown,
  quotas: Map<string, DesktopAccountPoolQuotaWindow[]>,
): readonly DesktopAccountPoolAccount[] {
  const files = asRecord(payload)?.files
  if (!Array.isArray(files)) return []
  return files.flatMap((entry): DesktopAccountPoolAccount[] => {
    const record = asRecord(entry)
    if (record === undefined) return []
    const authIndex = typeof record.auth_index === 'string' ? record.auth_index : ''
    const name = typeof record.name === 'string' ? record.name : authIndex
    if (authIndex.length === 0 || name.length === 0) return []
    const provider = typeof record.provider === 'string' ? record.provider : typeof record.type === 'string' ? record.type : 'unknown'
    const disabled = record.disabled === true
    const email = typeof record.email === 'string' ? record.email : typeof record.account === 'string' ? record.account : undefined
    const statusMessage = typeof record.status_message === 'string' ? record.status_message : undefined
    const createdAt = typeof record.created_at === 'string' ? record.created_at : undefined
    const projectId = typeof record.project_id === 'string' ? record.project_id : undefined
    return [{
      authIndex,
      name,
      provider,
      label: typeof record.label === 'string' ? record.label : name,
      status: disabled ? 'disabled' : typeof record.status === 'string' ? record.status : 'active',
      enabled: !disabled,
      successCount: typeof record.success === 'number' ? record.success : 0,
      failCount: typeof record.failed === 'number' ? record.failed : 0,
      quota: quotas.get(authIndex) ?? [],
      ...email === undefined ? {} : { email },
      ...statusMessage === undefined ? {} : { statusMessage },
      ...createdAt === undefined ? {} : { createdAt },
      ...projectId === undefined ? {} : { projectId },
    }]
  })
}

function windowsFromObservation(observation: QuotaObservation): DesktopAccountPoolQuotaWindow[] {
  return observation.windows.map((window) => {
    const remaining = remainingPercent(window.usedPercent, window.remainingFraction)
    const duration = window.periodHours
    const resetAt = window.resetAtMs
    const hasDuration = duration !== null && duration !== undefined
    const hasReset = resetAt !== null && resetAt !== undefined
    const timeRemainingPercent = remaining === undefined || !hasDuration || !hasReset
      ? undefined
      : timeRemaining(duration, resetAt, observation.observedAt)
    return {
      key: window.key,
      label: window.label ?? window.key,
      status: observation.status,
      ...remaining === undefined ? {} : { remainingPercent: remaining },
      ...timeRemainingPercent === undefined ? {} : { timeRemainingPercent },
    }
  })
}

function remainingPercent(usedPercent?: number, remainingFraction?: number): number | undefined {
  if (typeof remainingFraction === 'number') return Math.max(0, Math.min(100, remainingFraction * 100))
  if (typeof usedPercent === 'number') return Math.max(0, Math.min(100, 100 - usedPercent))
  return undefined
}

function timeRemaining(periodHours: number, resetAtMs: number, observedAt: number): number | undefined {
  const durationMs = periodHours * 3_600_000
  if (!(durationMs > 0)) return undefined
  return Math.max(0, Math.min(100, ((resetAtMs - observedAt) / durationMs) * 100))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function readError(payload: unknown): string | undefined {
  const record = asRecord(payload)
  return typeof record?.error === 'string' ? record.error : undefined
}
