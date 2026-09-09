/**
 * Global preferences for the official Sidebar workbench.
 *
 * The durable namespace keeps the Better Sidebar name so existing settings
 * documents require no copy or compatibility reader. This controller is the
 * only browser owner: Session stores may read its snapshot but do not retain a
 * second mutable preference document.
 */
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'

/** Existing durable namespace retained for in-place adoption. */
export const SIDEBAR_RIGHT_PREFERENCES_NAMESPACE = 'dsh-better-sidebar'

/** Range contract of {@link SidebarRightPreferences.defaultWidthPercent}. */
export const SIDEBAR_RIGHT_WIDTH_PERCENT_MIN = 20
/** Upper range contract of {@link SidebarRightPreferences.defaultWidthPercent}. */
export const SIDEBAR_RIGHT_WIDTH_PERCENT_MAX = 60
/** Default of {@link SidebarRightPreferences.defaultWidthPercent}. */
export const SIDEBAR_RIGHT_WIDTH_PERCENT_DEFAULT = 35

/** Range contract of {@link SidebarRightPreferences.terminalFontSize}. */
export const SIDEBAR_RIGHT_TERMINAL_FONT_SIZE_MIN = 9
/** Upper range contract of {@link SidebarRightPreferences.terminalFontSize}. */
export const SIDEBAR_RIGHT_TERMINAL_FONT_SIZE_MAX = 32
/** Default of {@link SidebarRightPreferences.terminalFontSize}. */
export const SIDEBAR_RIGHT_TERMINAL_FONT_SIZE_DEFAULT = 13

/** Range contract of {@link SidebarRightPreferences.titleBarStripPx}. */
export const SIDEBAR_RIGHT_TITLE_BAR_STRIP_MIN = 0
/** Upper range contract of {@link SidebarRightPreferences.titleBarStripPx}. */
export const SIDEBAR_RIGHT_TITLE_BAR_STRIP_MAX = 120
/** Default of {@link SidebarRightPreferences.titleBarStripPx}. */
export const SIDEBAR_RIGHT_TITLE_BAR_STRIP_DEFAULT = 40

/** Supported frame compatibility schemes. */
export const SIDEBAR_RIGHT_TITLE_BAR_SCHEMES = ['auto', 'web', 'preset', 'custom'] as const
/** Frame compatibility scheme. */
export type SidebarRightTitleBarScheme = typeof SIDEBAR_RIGHT_TITLE_BAR_SCHEMES[number]

/** The complete global preference document consumed by official Sidebar features. */
export interface SidebarRightPreferences {
  readonly openByDefault: boolean
  readonly defaultWidthPercent: number
  readonly autoOpenSubagent: boolean
  readonly autoOpenJobs: boolean
  readonly agentTerminalTools: boolean
  readonly agentOpenTools: boolean
  readonly bottomPanelAutoTerminal: boolean
  readonly terminalFontFamily: string
  readonly terminalFontSize: number
  readonly interceptOpenPath: boolean
  readonly editorExplorer: boolean
  readonly changesDiffFloat: boolean
  readonly workspaceFence: boolean
  readonly terminalShell: string
  readonly terminalShellArgs: string
  readonly titleBarScheme: SidebarRightTitleBarScheme
  readonly titleBarPresetId: string
  readonly customCss: string
  /** Legacy downgrade mirror; new UI writes derive it from the selected scheme. */
  readonly titleBarCompat: boolean
  /** Legacy custom-frame inset retained for existing settings documents. */
  readonly titleBarStripPx: number
  /** Global HTML escape hatch. `false` keeps the iframe sandbox. */
  readonly htmlViewerNoSandbox: boolean
  /** Initial per-occurrence HTML unlock; `false` starts sandboxed. */
  readonly htmlViewerDefaultUnsafe: boolean
  readonly browserNoSandbox: boolean
  readonly browserInterceptLinks: boolean
  readonly browserInterceptHttp: boolean
  readonly browserInterceptHttps: boolean
  readonly browserAllowedLoopback: string
  /** Missing ids are enabled; only an explicit `false` blocks new tab opens. */
  readonly tabsEnabled: Readonly<Record<string, boolean>>
  /** Missing ids are enabled; only an explicit `false` removes a viewer from matching. */
  readonly viewersEnabled: Readonly<Record<string, boolean>>
  /** Descriptor-owned JSON settings, keyed by stable descriptor id. */
  readonly pluginSettings: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>
}

type BooleanPreferenceKey = {
  [Key in keyof SidebarRightPreferences]: SidebarRightPreferences[Key] extends boolean ? Key : never
}[keyof SidebarRightPreferences]
type StringPreferenceKey = {
  [Key in keyof SidebarRightPreferences]: SidebarRightPreferences[Key] extends string ? Key : never
}[keyof SidebarRightPreferences]

/** Safe fallback used before the Host settings document is available. */
export const SIDEBAR_RIGHT_PREFERENCES_DEFAULTS: SidebarRightPreferences = {
  openByDefault: false,
  defaultWidthPercent: SIDEBAR_RIGHT_WIDTH_PERCENT_DEFAULT,
  autoOpenSubagent: true,
  autoOpenJobs: true,
  agentTerminalTools: false,
  agentOpenTools: false,
  bottomPanelAutoTerminal: true,
  terminalFontFamily: '',
  terminalFontSize: SIDEBAR_RIGHT_TERMINAL_FONT_SIZE_DEFAULT,
  interceptOpenPath: true,
  editorExplorer: false,
  changesDiffFloat: true,
  workspaceFence: true,
  terminalShell: '',
  terminalShellArgs: '',
  titleBarScheme: 'auto',
  titleBarPresetId: '',
  customCss: '',
  titleBarCompat: false,
  titleBarStripPx: SIDEBAR_RIGHT_TITLE_BAR_STRIP_DEFAULT,
  htmlViewerNoSandbox: false,
  htmlViewerDefaultUnsafe: false,
  browserNoSandbox: false,
  browserInterceptLinks: true,
  browserInterceptHttp: true,
  browserInterceptHttps: false,
  browserAllowedLoopback: '',
  tabsEnabled: {},
  viewersEnabled: {},
  pluginSettings: {},
}

/**
 * Clamp a configured panel-width percentage.
 * @param value - untrusted percentage.
 * @returns supported integer percentage.
 */
export function clampSidebarRightWidthPercent(value: number): number {
  return Math.min(SIDEBAR_RIGHT_WIDTH_PERCENT_MAX, Math.max(SIDEBAR_RIGHT_WIDTH_PERCENT_MIN, Math.round(value)))
}

/**
 * Clamp a configured Terminal font size.
 * @param value - untrusted font size.
 * @returns supported integer font size.
 */
export function clampSidebarRightTerminalFontSize(value: number): number {
  return Math.min(
    SIDEBAR_RIGHT_TERMINAL_FONT_SIZE_MAX,
    Math.max(SIDEBAR_RIGHT_TERMINAL_FONT_SIZE_MIN, Math.round(value)),
  )
}

/**
 * Clamp a configured custom-frame inset.
 * @param value - untrusted inset in CSS pixels.
 * @returns supported integer inset.
 */
export function clampSidebarRightTitleBarStrip(value: number): number {
  return Math.min(SIDEBAR_RIGHT_TITLE_BAR_STRIP_MAX, Math.max(SIDEBAR_RIGHT_TITLE_BAR_STRIP_MIN, Math.round(value)))
}

function booleanMapOf(value: unknown): Readonly<Record<string, boolean>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, boolean> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'boolean') result[key] = item
  }
  return result
}

function pluginSettingsOf(value: unknown): SidebarRightPreferences['pluginSettings'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, Readonly<Record<string, JsonValue>>> = {}
  for (const [id, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const snapshot = snapshotJsonValue(item)
    if (snapshot !== undefined) result[id] = snapshot as Record<string, JsonValue>
  }
  return result
}

function titleBarSchemeOf(record: Record<string, unknown>): SidebarRightTitleBarScheme {
  if (
    typeof record.titleBarScheme === 'string'
    && (SIDEBAR_RIGHT_TITLE_BAR_SCHEMES as readonly string[]).includes(record.titleBarScheme)
  ) {
    return record.titleBarScheme as SidebarRightTitleBarScheme
  }
  const stripConfigured = typeof record.titleBarStripPx === 'number'
    && Number.isFinite(record.titleBarStripPx)
    && record.titleBarStripPx !== SIDEBAR_RIGHT_TITLE_BAR_STRIP_DEFAULT
  return record.titleBarCompat === true || stripConfigured ? 'custom' : 'auto'
}

/**
 * Decode the retained settings section, preserving valid fields and defaulting
 * each malformed field independently.
 * @param value - resolved Host settings section.
 * @returns complete official preferences.
 */
export function parseSidebarRightPreferences(value: unknown): SidebarRightPreferences {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ...SIDEBAR_RIGHT_PREFERENCES_DEFAULTS }
  }
  const record = value as Record<string, unknown>
  const bool = (key: BooleanPreferenceKey): boolean => {
    const candidate = record[key]
    return typeof candidate === 'boolean' ? candidate : SIDEBAR_RIGHT_PREFERENCES_DEFAULTS[key]
  }
  const text = (key: StringPreferenceKey): string => {
    const candidate = record[key]
    return typeof candidate === 'string' ? candidate : SIDEBAR_RIGHT_PREFERENCES_DEFAULTS[key]
  }
  return {
    openByDefault: bool('openByDefault'),
    defaultWidthPercent: typeof record.defaultWidthPercent === 'number' && Number.isFinite(record.defaultWidthPercent)
      ? clampSidebarRightWidthPercent(record.defaultWidthPercent)
      : SIDEBAR_RIGHT_WIDTH_PERCENT_DEFAULT,
    autoOpenSubagent: bool('autoOpenSubagent'),
    autoOpenJobs: bool('autoOpenJobs'),
    agentTerminalTools: bool('agentTerminalTools'),
    agentOpenTools: bool('agentOpenTools'),
    bottomPanelAutoTerminal: bool('bottomPanelAutoTerminal'),
    terminalFontFamily: text('terminalFontFamily'),
    terminalFontSize: typeof record.terminalFontSize === 'number' && Number.isFinite(record.terminalFontSize)
      ? clampSidebarRightTerminalFontSize(record.terminalFontSize)
      : SIDEBAR_RIGHT_TERMINAL_FONT_SIZE_DEFAULT,
    interceptOpenPath: bool('interceptOpenPath'),
    editorExplorer: bool('editorExplorer'),
    changesDiffFloat: bool('changesDiffFloat'),
    workspaceFence: bool('workspaceFence'),
    terminalShell: text('terminalShell'),
    terminalShellArgs: text('terminalShellArgs'),
    titleBarScheme: titleBarSchemeOf(record),
    titleBarPresetId: text('titleBarPresetId'),
    customCss: text('customCss'),
    titleBarCompat: bool('titleBarCompat'),
    titleBarStripPx: typeof record.titleBarStripPx === 'number' && Number.isFinite(record.titleBarStripPx)
      ? clampSidebarRightTitleBarStrip(record.titleBarStripPx)
      : SIDEBAR_RIGHT_TITLE_BAR_STRIP_DEFAULT,
    htmlViewerNoSandbox: bool('htmlViewerNoSandbox'),
    htmlViewerDefaultUnsafe: bool('htmlViewerDefaultUnsafe'),
    browserNoSandbox: bool('browserNoSandbox'),
    browserInterceptLinks: bool('browserInterceptLinks'),
    browserInterceptHttp: bool('browserInterceptHttp'),
    browserInterceptHttps: bool('browserInterceptHttps'),
    browserAllowedLoopback: text('browserAllowedLoopback'),
    tabsEnabled: booleanMapOf(record.tabsEnabled),
    viewersEnabled: booleanMapOf(record.viewersEnabled),
    pluginSettings: pluginSettingsOf(record.pluginSettings),
  }
}

/** HTML security settings consumed by the official viewer host. */
export interface SidebarRightHtmlViewerSafety {
  /** Every occurrence is unsandboxed while this global escape hatch is on. */
  readonly forceUnsandboxed: boolean
  /** New occurrences start unlocked; an occurrence may restore its sandbox. */
  readonly defaultUnsandboxed: boolean
}

/** Stable global preferences projection. */
export interface SidebarRightPreferencesSnapshot {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly preferences: SidebarRightPreferences
  readonly revision: number | undefined
  readonly writable: boolean
}

/** Read face accepted by descriptor registries and viewer hosts. */
export interface SidebarRightPreferencesReader {
  getSnapshot(): SidebarRightPreferencesSnapshot
  subscribe(listener: () => void): () => void
  isTabEnabled(id: string): boolean
  isViewerEnabled(id: string): boolean
  pluginSettings(id: string): Readonly<Record<string, JsonValue>>
  htmlViewerSafety(): SidebarRightHtmlViewerSafety
}

/** Empty plugin blob shared across reads. */
const EMPTY_PLUGIN_SETTINGS: Readonly<Record<string, JsonValue>> = {}

/**
 * The official browser owner of the retained global preference namespace.
 * Writes use path operations so simultaneous descriptors never restate or
 * erase one another's open-map entries.
 */
export class SidebarRightPreferencesController implements SidebarRightPreferencesReader {
  private readonly listeners = new Set<() => void>()
  private snapshot: SidebarRightPreferencesSnapshot

  /** @param scope - the one settings-domain scope bound to the retained namespace. */
  constructor(private readonly scope: SettingsScope<SidebarRightPreferences>) {
    this.snapshot = this.derive()
  }

  /**
   * Start projecting the settings scope for this controller's activation lifetime.
   * @returns disposer removing the scope subscription.
   */
  connect(): () => void {
    const unsubscribe = this.scope.subscribe(() => {
      this.snapshot = this.derive()
      notifySubscribers(this.listeners, '[ui-sidebar-right] preferences')
    })
    this.snapshot = this.derive()
    return unsubscribe
  }

  /** @returns stable preferences snapshot until the settings scope changes. */
  getSnapshot(): SidebarRightPreferencesSnapshot {
    return this.snapshot
  }

  /**
   * Observe preference snapshot replacements.
   * @param listener - synchronous invalidation callback.
   * @returns unsubscribe callback.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Whether a tab definition admits new opens.
   * @param id - stable definition id.
   * @returns false only for an explicit disabled entry.
   */
  isTabEnabled(id: string): boolean {
    return this.snapshot.preferences.tabsEnabled[id] !== false
  }

  /**
   * Whether a viewer participates in matching.
   * @param id - stable viewer id.
   * @returns false only for an explicit disabled entry.
   */
  isViewerEnabled(id: string): boolean {
    return this.snapshot.preferences.viewersEnabled[id] !== false
  }

  /**
   * Descriptor-owned settings, or a stable empty blob.
   * @param id - stable descriptor id.
   * @returns current JSON settings for that descriptor.
   */
  pluginSettings(id: string): Readonly<Record<string, JsonValue>> {
    return this.snapshot.preferences.pluginSettings[id] ?? EMPTY_PLUGIN_SETTINGS
  }

  /** @returns security defaults for each newly mounted HTML occurrence. */
  htmlViewerSafety(): SidebarRightHtmlViewerSafety {
    const { htmlViewerNoSandbox, htmlViewerDefaultUnsafe } = this.snapshot.preferences
    return {
      forceUnsandboxed: htmlViewerNoSandbox,
      defaultUnsandboxed: htmlViewerNoSandbox || htmlViewerDefaultUnsafe,
    }
  }

  /**
   * Atomically update top-level preferences.
   * @param patch - fields selected by one user action.
   * @returns settlement after Host validation and persistence.
   */
  update(patch: Partial<SidebarRightPreferences>): Promise<void> {
    const ops = Object.entries(patch).map(([field, value]) => {
      const snapshot = snapshotJsonValue(value)
      if (snapshot === undefined) throw new TypeError(`sidebarRight: preference "${field}" is not JSON`)
      return { op: 'set' as const, path: [field], value: snapshot }
    })
    return ops.length === 0 ? Promise.resolve() : this.scope.mutate(ops)
  }

  /**
   * Persist one tab enable switch without restating the open map.
   * @param id - stable definition id.
   * @param enabled - whether new occurrences are allowed.
   * @returns Host persistence settlement.
   */
  setTabEnabled(id: string, enabled: boolean): Promise<void> {
    return this.scope.mutate([{ op: 'set', path: ['tabsEnabled', id], value: enabled }])
  }

  /**
   * Persist one viewer enable switch without restating the open map.
   * @param id - stable viewer id.
   * @param enabled - whether matching includes it.
   * @returns Host persistence settlement.
   */
  setViewerEnabled(id: string, enabled: boolean): Promise<void> {
    return this.scope.mutate([{ op: 'set', path: ['viewersEnabled', id], value: enabled }])
  }

  /**
   * Persist or remove one descriptor-owned setting without restating sibling blobs.
   * @param id - stable descriptor id.
   * @param key - descriptor-owned field.
   * @param value - JSON value, or `undefined` to clear the field.
   * @returns Host persistence settlement.
   */
  setPluginSetting(id: string, key: string, value: JsonValue | undefined): Promise<void> {
    if (id.length === 0 || key.length === 0) throw new TypeError('sidebarRight: plugin setting id and key must not be empty')
    if (value === undefined) {
      return this.scope.mutate([{ op: 'unset', path: ['pluginSettings', id, key] }])
    }
    const snapshot = snapshotJsonValue(value)
    if (snapshot === undefined) throw new TypeError(`sidebarRight: plugin setting "${id}.${key}" is not JSON`)
    return this.scope.mutate([{ op: 'set', path: ['pluginSettings', id, key], value: snapshot }])
  }

  private derive(): SidebarRightPreferencesSnapshot {
    const source = this.scope.getSnapshot()
    return {
      status: source.status,
      preferences: source.value ?? SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
      revision: source.revision,
      writable: source.writable,
    }
  }
}
