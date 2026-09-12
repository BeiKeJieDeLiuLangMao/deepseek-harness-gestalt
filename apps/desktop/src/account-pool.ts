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
  DesktopAccountPoolEditableFields,
  DesktopAccountPoolFieldPatch,
  DesktopAccountPoolModel,
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
  readonly dismissLogin: () => Promise<DesktopAccountPoolSnapshot>
  readonly submitCallback: (
    input: { provider: AccountPoolLoginKind; redirectUrl: string },
  ) => Promise<DesktopAccountPoolSnapshot>
  readonly submitGlmKey: (
    input: { apiKey: string; site?: string; organization?: string; project?: string },
  ) => Promise<DesktopAccountPoolSnapshot>
  readonly refreshQuota: (authIndex: string) => Promise<DesktopAccountPoolSnapshot>
  readonly refreshAllQuota: () => Promise<DesktopAccountPoolSnapshot>
  readonly listModels: (name: string) => Promise<readonly DesktopAccountPoolModel[]>
  readonly downloadAuthFile: (name: string) => Promise<{ name: string; body: string }>
  readonly readFields: (name: string) => Promise<DesktopAccountPoolEditableFields>
  readonly patchFields: (name: string, fields: DesktopAccountPoolFieldPatch) => Promise<DesktopAccountPoolSnapshot>
  readonly subscribe: (listener: (snapshot: DesktopAccountPoolSnapshot) => void) => () => void
}

export function createDesktopAccountPool(options: {
  supervisor: () => CLIProxyAPISupervisor | undefined
  management: () => QuotaObservationTransport | undefined
  wait?: (ms: number) => Promise<void>
}): DesktopAccountPoolActions {
  const listeners = new Set<(snapshot: DesktopAccountPoolSnapshot) => void>()
  let snapshot: DesktopAccountPoolSnapshot = Object.freeze({ state: 'starting', accounts: [] })
  const quotas = new Map<string, { windows: DesktopAccountPoolQuotaWindow[]; planType?: string; resetCreditsAvailable?: number }>()

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

  const observeQuota = async (
    account: DesktopAccountPoolAccount,
    transport: QuotaObservationTransport,
  ): Promise<void> => {
    const provider = PROVIDER_TO_QUOTA[account.provider]
    if (provider === undefined) return
    const observation = await createQuotaObserver({ transport }).observe({
      provider,
      authIndex: account.authIndex as QuotaObservation['accountRef'],
      ...account.projectId === undefined ? {} : { projectId: account.projectId },
    })
    quotas.set(account.authIndex, {
      windows: windowsFromObservation(observation),
      ...observation.planType === undefined ? {} : { planType: observation.planType },
      ...observation.resetCredits?.availableCount === null || observation.resetCredits?.availableCount === undefined
        ? {}
        : { resetCreditsAvailable: observation.resetCredits.availableCount },
    })
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

  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) }))

  const rosterNames = (): ReadonlySet<string> => new Set(snapshot.accounts.map(account => account.name))

  const dismissLogin = (): DesktopAccountPoolSnapshot => {
    const { login: _login, ...rest } = snapshot
    return publish(rest)
  }

  const refreshUntilGrown = async (previous: ReadonlySet<string>): Promise<DesktopAccountPoolSnapshot> => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const next = await refreshRoster()
      if (next.accounts.some(account => !previous.has(account.name))) return next
      await wait(400)
    }
    return refreshRoster()
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
      const flow = kind === 'kimi' || kind === 'xai' ? 'device' as const : 'pkce' as const
      publish({ ...snapshot, login: Object.freeze({ kind, flow }) })
      try {
        const { statusCode, payload } = await requestJson('GET', LOGIN_PATH[kind])
        const record = asRecord(payload)
        if (statusCode < 200 || statusCode >= 300 || record === undefined) {
          throw new Error(readError(payload) ?? 'Login did not start')
        }
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
      } catch (cause) {
        const login: AccountPoolLoginStart = Object.freeze({
          kind,
          flow,
          error: cause instanceof Error ? cause.message : 'Login did not start',
        })
        publish({ ...snapshot, login })
        return login
      }
    },
    loginStatus: async (state) => {
      const { payload } = await requestJson('GET', `/v0/management/get-auth-status?state=${encodeURIComponent(state)}`)
      const record = asRecord(payload)
      const status = typeof record?.status === 'string' ? record.status : 'wait'
      if (status === 'ok') {
        const previous = rosterNames()
        const { login: _login, ...rest } = snapshot
        publish(rest)
        return refreshUntilGrown(previous)
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
      return dismissLogin()
    },
    dismissLogin: async () => dismissLogin(),
    submitCallback: async (input) => {
      const redirectUrl = input.redirectUrl.trim()
      if (redirectUrl.length === 0) {
        return publish({ ...snapshot, error: 'Callback URL is required' })
      }
      const { statusCode, payload } = await requestJson('POST', '/v0/management/oauth-callback', {
        provider: input.provider,
        redirect_url: redirectUrl,
      })
      if (statusCode < 200 || statusCode >= 300) {
        const login: AccountPoolLoginStart = Object.freeze({
          ...snapshot.login,
          kind: input.provider,
          flow: 'pkce' as const,
          error: readError(payload) ?? 'Callback URL was not accepted',
        })
        return publish({ ...snapshot, login })
      }
      const previous = rosterNames()
      const { login: _login, ...rest } = snapshot
      publish(rest)
      return refreshUntilGrown(previous)
    },
    listModels: async (name) => {
      const { statusCode, payload } = await requestJson(
        'GET',
        `/v0/management/auth-files/models?name=${encodeURIComponent(name)}`,
      )
      if (statusCode < 200 || statusCode >= 300) return []
      const models = asRecord(payload)?.models
      if (!Array.isArray(models)) return []
      return models.flatMap((entry) => {
        const record = asRecord(entry)
        const id = typeof record?.id === 'string' ? record.id : ''
        if (id.length === 0) return []
        const display = typeof record.display_name === 'string' ? record.display_name : undefined
        const ownedBy = typeof record.owned_by === 'string' ? record.owned_by : undefined
        return [{
          id,
          ...display === undefined ? {} : { name: display },
          ...ownedBy === undefined ? {} : { ownedBy },
        }]
      })
    },
    downloadAuthFile: async (name) => {
      const response = await core().coreRequest({
        method: 'GET',
        path: `/v0/management/auth-files/download?name=${encodeURIComponent(name)}`,
      })
      if (response.statusCode < 200 || response.statusCode >= 300) {
        let payload: unknown
        try {
          payload = response.body.length === 0 ? undefined : JSON.parse(response.body) as unknown
        } catch {
          payload = undefined
        }
        throw new Error(readError(payload) ?? 'Download did not succeed')
      }
      return { name, body: response.body }
    },
    readFields: async (name) => {
      const response = await core().coreRequest({
        method: 'GET',
        path: `/v0/management/auth-files/download?name=${encodeURIComponent(name)}`,
      })
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error('Auth file fields could not be read')
      }
      return redactEditableFields(name, response.body)
    },
    patchFields: async (name, fields) => {
      const body: Record<string, unknown> = { name }
      if (fields.note !== undefined) body.note = fields.note
      if (fields.prefix !== undefined) body.prefix = fields.prefix
      if (fields.proxyUrl !== undefined) body.proxy_url = fields.proxyUrl
      if (fields.priority !== undefined) body.priority = fields.priority
      if (fields.weight !== undefined) body.weight = fields.weight
      if (fields.disableCooling !== undefined) body.disable_cooling = fields.disableCooling
      if (fields.websockets !== undefined) body.websockets = fields.websockets
      if (fields.excludedModels !== undefined) body.excluded_models = [...fields.excludedModels]
      if (fields.headers !== undefined) body.headers = { ...fields.headers }
      const { statusCode, payload } = await requestJson('PATCH', '/v0/management/auth-files/fields', body)
      if (statusCode < 200 || statusCode >= 300) {
        return refreshRoster(readError(payload) ?? 'Fields were not saved')
      }
      return refreshRoster()
    },
    submitGlmKey: async (input) => {
      const apiKey = input.apiKey.trim()
      if (apiKey.length === 0) return publish({ ...snapshot, error: 'GLM Coding Plan key is required' })
      const site = input.site === 'international' ? 'international' : 'cn'
      const entry = {
        'api-key': apiKey,
        site,
        ...input.organization === undefined ? {} : { organization: input.organization },
        ...input.project === undefined ? {} : { project: input.project },
      }
      const existing = await requestJson('GET', '/v0/management/glm-coding-plan')
      const views = asRecord(existing.payload)?.['glm-coding-plan']
      const count = Array.isArray(views) ? views.length : 0
      const { statusCode, payload } = count === 0
        ? await requestJson('PUT', '/v0/management/glm-coding-plan', [entry])
        : await requestJson('PATCH', '/v0/management/glm-coding-plan', { index: count, value: entry })
      if (statusCode < 200 || statusCode >= 300) {
        return publish({ ...snapshot, error: readError(payload) ?? 'GLM Coding Plan key was not accepted' })
      }
      const previous = rosterNames()
      const { login: _glmLogin, ...rest } = snapshot
      publish(rest)
      return refreshUntilGrown(previous)
    },
    refreshQuota: async (authIndex) => {
      const account = snapshot.accounts.find(item => item.authIndex === authIndex)
      const transport = options.management()
      if (account === undefined || transport === undefined) {
        return publish({ ...snapshot, error: 'Quota observation is unavailable' })
      }
      await observeQuota(account, transport)
      return refreshRoster()
    },
    refreshAllQuota: async () => {
      const transport = options.management()
      if (transport === undefined) {
        return publish({ ...snapshot, error: 'Quota observation is unavailable' })
      }
      await Promise.all(snapshot.accounts.map(account => observeQuota(account, transport)))
      return refreshRoster()
    },
  }
}

function redactAccounts(
  payload: unknown,
  quotas: Map<string, { windows: DesktopAccountPoolQuotaWindow[]; planType?: string; resetCreditsAvailable?: number }>,
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
    const statusMessage = typeof record.status_message === 'string' && record.status_message.length > 0 ? record.status_message : undefined
    const createdAt = stamp(record.created_at)
    const modifiedAt = stamp(record.modtime) ?? stamp(record.updated_at)
    const note = typeof record.note === 'string' ? record.note : undefined
    const prefix = typeof record.prefix === 'string' ? record.prefix : undefined
    const proxyUrl = typeof record.proxy_url === 'string' ? record.proxy_url : undefined
    const priority = typeof record.priority === 'number' && Number.isFinite(record.priority) ? record.priority : undefined
    const weight = typeof record.weight === 'number' && Number.isFinite(record.weight) ? record.weight : undefined
    const disableCooling = typeof record.disable_cooling === 'boolean' ? record.disable_cooling : undefined
    const websockets = typeof record.websockets === 'boolean' ? record.websockets : undefined
    const excludedModels = stringList(record.excluded_models) ?? stringList(record['excluded-models'])
    const headers = stringMap(record.headers)
    const sizeBytes = typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : undefined
    const projectId = typeof record.project_id === 'string' ? record.project_id : undefined
    const observed = quotas.get(authIndex)
    return [{
      authIndex,
      name,
      provider,
      label: typeof record.label === 'string' ? record.label : name,
      status: disabled ? 'disabled' : typeof record.status === 'string' ? record.status : 'active',
      enabled: !disabled,
      successCount: typeof record.success === 'number' ? record.success : 0,
      failCount: typeof record.failed === 'number' ? record.failed : 0,
      quota: observed?.windows ?? [],
      recentRequests: recentRequests(record.recent_requests),
      ...email === undefined ? {} : { email },
      ...statusMessage === undefined ? {} : { statusMessage },
      ...createdAt === undefined ? {} : { createdAt },
      ...modifiedAt === undefined ? {} : { modifiedAt },
      ...sizeBytes === undefined ? {} : { sizeBytes },
      ...note === undefined ? {} : { note },
      ...prefix === undefined ? {} : { prefix },
      ...proxyUrl === undefined ? {} : { proxyUrl },
      ...priority === undefined ? {} : { priority },
      ...weight === undefined ? {} : { weight },
      ...disableCooling === undefined ? {} : { disableCooling },
      ...websockets === undefined ? {} : { websockets },
      ...excludedModels === undefined ? {} : { excludedModels },
      ...headers === undefined ? {} : { headers },
      ...projectId === undefined ? {} : { projectId },
      ...observed?.planType === undefined ? {} : { planType: observed.planType },
      ...observed?.resetCreditsAvailable === undefined ? {} : { resetCreditsAvailable: observed.resetCreditsAvailable },
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
      ...typeof duration === 'number' && duration > 0 ? { periodHours: duration } : {},
      ...typeof resetAt === 'number' ? { resetAtMs: resetAt } : {},
      ...window.group === undefined ? {} : { group: window.group },
      ...window.groupDescription === undefined ? {} : { groupDescription: window.groupDescription },
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

function stamp(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value
  return undefined
}

function recentRequests(value: unknown): { success: number; failed: number }[] {
  if (!Array.isArray(value)) return Array.from({ length: 20 }, () => ({ success: 0, failed: 0 }))
  return value.map((entry) => {
    const record = asRecord(entry)
    return {
      success: typeof record?.success === 'number' ? record.success : 0,
      failed: typeof record?.failed === 'number' ? record.failed : 0,
    }
  })
}

function readError(payload: unknown): string | undefined {
  const record = asRecord(payload)
  return typeof record?.error === 'string' ? record.error : undefined
}

const SECRET_KEYS = new Set([
  'access_token', 'refresh_token', 'id_token', 'api_key', 'api-key', 'token', 'secret',
  'client_secret', 'password', 'private_key',
])

const INFO_KEYS = [
  'account', 'account_type', 'auth_index', 'created_at', 'disabled', 'email',
  'failed', 'id', 'type', 'prefix', 'priority', 'weight', 'note', 'websockets',
  'disable_cooling', 'success', 'status', 'provider',
] as const

function redactEditableFields(name: string, body: string): DesktopAccountPoolEditableFields {
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    parsed = undefined
  }
  const record = asRecord(parsed) ?? {}
  const info: Record<string, string | number | boolean> = { id: name }
  for (const key of INFO_KEYS) {
    const value = record[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') info[key] = value
  }
  if (typeof record.proxy_url === 'string' && record.proxy_url.length > 0) {
    info.proxy_url = redactProxyUrl(record.proxy_url)
  }
  const fields: DesktopAccountPoolFieldPatch = {
    ...typeof record.note === 'string' ? { note: record.note } : {},
    ...typeof record.prefix === 'string' ? { prefix: record.prefix } : {},
    ...typeof record.proxy_url === 'string' ? { proxyUrl: redactProxyUrl(record.proxy_url) } : {},
    ...typeof record.priority === 'number' ? { priority: record.priority } : {},
    ...typeof record.weight === 'number' ? { weight: record.weight } : {},
    ...typeof record.disable_cooling === 'boolean' ? { disableCooling: record.disable_cooling } : {},
    ...typeof record.websockets === 'boolean' ? { websockets: record.websockets } : {},
    ...stringList(record.excluded_models) === undefined && stringList(record['excluded-models']) === undefined
      ? {}
      : { excludedModels: stringList(record.excluded_models) ?? stringList(record['excluded-models']) ?? [] },
    ...stringMap(record.headers) === undefined ? {} : { headers: stringMap(record.headers) },
  }
  for (const key of Object.keys(record)) {
    if (SECRET_KEYS.has(key)) continue
    const value = record[key]
    if ((typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') && info[key] === undefined) {
      info[key] = value
    }
  }
  return { name, info, fields }
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.flatMap(entry => typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : [])
  return items
}

function stringMap(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string') out[key] = entry
  }
  return out
}

function redactProxyUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      parsed.username = '***'
      parsed.password = '***'
    }
    return parsed.toString()
  } catch {
    return url.replace(/\/\/[^@/]+@/, '//***:***@')
  }
}
