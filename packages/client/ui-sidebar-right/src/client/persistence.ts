/** Versioned official workbench persistence and Better Sidebar migration. */
import type {
  FloatRect, LayoutNode, LayoutState, NodeId, PaneId, PaneNode, SplitId, SplitNode, TabId, TabRecord,
} from '@deepseek-ai/dsh-client-ui-dockkit'
import { EMPTY_HISTORY } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { SidebarRightTabPin, SidebarRightTabState } from './contract/payload.ts'
import { makeGuideTab, pageInstanceAddress } from './contract/seed.ts'
import {
  BOTTOM_HEIGHT_DEFAULT, BOTTOM_HEIGHT_MIN, type SurfaceState,
} from './stores.ts'

/** Current official workbench persistence version. */
export const SIDEBAR_WORKBENCH_VERSION = 1
/** Official per-Session key; the legacy v1 key remains untouched after migration. */
export const SIDEBAR_WORKBENCH_STORAGE_PREFIX = 'dsh-sidebar-workbench:v1'
/** Legacy Better Sidebar key read during one-way adoption and retained for rollback. */
export const LEGACY_SIDEBAR_STORAGE_PREFIX = 'dsh-sidebar:v1'

/** Storage operations used by the codec. */
export interface SidebarWorkbenchStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface PersistedDock {
  readonly layout: LayoutState
}

interface PersistedDocument {
  readonly version: typeof SIDEBAR_WORKBENCH_VERSION
  readonly right: PersistedDock
  readonly bottom: PersistedDock
  readonly minted: number
  readonly bottomHeight: number
  readonly bottomOpenedOnce: boolean
  readonly tabs: Readonly<Partial<Record<TabId, SidebarRightTabState>>>
  readonly data: Readonly<Record<string, JsonValue>>
  readonly migratedFrom?: typeof LEGACY_SIDEBAR_STORAGE_PREFIX
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function numbers(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: number[] = []
  for (const item of value as unknown[]) {
    if (!finite(item)) return undefined
    result.push(item)
  }
  return result
}

function jsonValue(value: unknown): JsonValue | undefined {
  return snapshotJsonValue(value) as JsonValue | undefined
}

function paneId(value: string): PaneId {
  return value as PaneId
}

function splitId(value: string): SplitId {
  return value as SplitId
}

function tabId(value: string): TabId {
  return value as TabId
}

function nodeId(value: string): NodeId {
  return value as NodeId
}

function floatRect(value: unknown): FloatRect | undefined {
  const record = recordOf(value)
  if (record === undefined || !finite(record.x) || !finite(record.y) || !finite(record.width) || !finite(record.height)) {
    return undefined
  }
  if (record.width <= 0 || record.height <= 0) return undefined
  return { x: record.x, y: record.y, width: record.width, height: record.height }
}

function tabRecord(value: unknown): TabRecord | undefined {
  const record = recordOf(value)
  if (
    record === undefined
    || typeof record.id !== 'string'
    || typeof record.kind !== 'string'
    || typeof record.contentId !== 'string'
    || typeof record.title !== 'string'
  ) return undefined
  return { id: tabId(record.id), kind: record.kind, contentId: record.contentId, title: record.title }
}

function paneNode(value: Record<string, unknown>): PaneNode | undefined {
  if (typeof value.id !== 'string' || (value.host !== 'dock' && value.host !== 'float') || !Array.isArray(value.tabs)) {
    return undefined
  }
  if (value.tabs.some(id => typeof id !== 'string')) return undefined
  const tabs = value.tabs.map(id => tabId(id as string))
  const active = value.activeTabId
  if (active !== undefined && (typeof active !== 'string' || !tabs.includes(tabId(active)))) return undefined
  const rect = value.host === 'float' ? floatRect(value.rect) : undefined
  if (value.host === 'float' && (rect === undefined || tabs.length !== 1)) return undefined
  if (value.host === 'dock' && value.rect !== undefined) return undefined
  return {
    kind: 'pane', id: paneId(value.id), host: value.host, tabs,
    activeTabId: active === undefined ? undefined : tabId(active), rect,
  }
}

function splitNode(value: Record<string, unknown>): SplitNode | undefined {
  const sizes = numbers(value.sizes)
  if (
    typeof value.id !== 'string'
    || (value.axis !== 'row' && value.axis !== 'column')
    || !Array.isArray(value.children)
    || value.children.length < 2
    || value.children.some(id => typeof id !== 'string')
    || sizes === undefined
    || sizes.length !== value.children.length
    || sizes.some(size => size <= 0)
  ) return undefined
  const sum = sizes.reduce((total, size) => total + size, 0)
  if (Math.abs(sum - 1) > 0.000_001) return undefined
  return {
    kind: 'split', id: splitId(value.id), axis: value.axis,
    children: value.children.map(id => nodeId(id as string)), sizes,
  }
}

function layoutState(value: unknown): LayoutState | undefined {
  const record = recordOf(value)
  const rawNodes = recordOf(record?.nodes)
  const rawTabs = recordOf(record?.tabs)
  if (
    record === undefined || rawNodes === undefined || rawTabs === undefined
    || typeof record.rootId !== 'string' || !Array.isArray(record.floats)
    || record.floats.some(id => typeof id !== 'string') || typeof record.activePaneId !== 'string'
    || typeof record.expanded !== 'boolean' || (record.mode !== 'push' && record.mode !== 'fullscreen')
  ) return undefined
  const nodes: Partial<Record<NodeId, LayoutNode>> = {}
  for (const [key, raw] of Object.entries(rawNodes)) {
    const candidate = recordOf(raw)
    const node = candidate?.kind === 'pane' ? paneNode(candidate) : candidate?.kind === 'split' ? splitNode(candidate) : undefined
    if (node === undefined || node.id !== key) return undefined
    nodes[node.id] = node
  }
  const tabs: Partial<Record<TabId, TabRecord>> = {}
  for (const [key, raw] of Object.entries(rawTabs)) {
    const tab = tabRecord(raw)
    if (tab === undefined || tab.id !== key) return undefined
    tabs[tab.id] = tab
  }
  const rootId = nodeId(record.rootId)
  const root = nodes[rootId]
  const activePaneId = paneId(record.activePaneId)
  if (root === undefined || root.kind === 'pane' && root.host !== 'dock') return undefined
  const seenNodes = new Set<NodeId>()
  const seenTabs = new Set<TabId>()
  const visit = (id: NodeId): boolean => {
    if (seenNodes.has(id)) return false
    const node = nodes[id]
    if (node === undefined) return false
    seenNodes.add(id)
    if (node.kind === 'split') return node.children.every(visit)
    if (node.host !== 'dock') return false
    for (const id of node.tabs) {
      if (seenTabs.has(id) || tabs[id] === undefined) return false
      seenTabs.add(id)
    }
    return node.tabs.length === 0 ? node.activeTabId === undefined : node.activeTabId !== undefined
  }
  if (!visit(rootId)) return undefined
  const floats = record.floats.map(id => paneId(id as string))
  for (const id of floats) {
    const node = nodes[id]
    if (seenNodes.has(id) || node?.kind !== 'pane' || node.host !== 'float') return undefined
    seenNodes.add(id)
    for (const owned of node.tabs) {
      if (seenTabs.has(owned) || tabs[owned] === undefined) return undefined
      seenTabs.add(owned)
    }
  }
  if (
    seenNodes.size !== Object.keys(nodes).length
    || seenTabs.size !== Object.keys(tabs).length
    || nodes[activePaneId]?.kind !== 'pane'
  ) return undefined
  return {
    nodes: nodes as Readonly<Record<NodeId, LayoutNode>>,
    tabs: tabs as Readonly<Record<TabId, TabRecord>>,
    rootId,
    floats,
    activePaneId,
    expanded: record.expanded,
    mode: record.mode,
  }
}

function pinState(value: unknown): SidebarRightTabPin | undefined {
  const record = recordOf(value)
  if (
    record === undefined || (record.scope !== 'workspace' && record.scope !== 'global')
    || typeof record.homeSessionId !== 'string'
    || (record.homeCwd !== undefined && typeof record.homeCwd !== 'string')
  ) return undefined
  return {
    scope: record.scope,
    homeSessionId: record.homeSessionId as SessionId,
    ...(typeof record.homeCwd === 'string' ? { homeCwd: record.homeCwd } : {}),
  }
}

function tabStates(value: unknown, open: ReadonlySet<TabId>): Partial<Record<TabId, SidebarRightTabState>> | undefined {
  const record = recordOf(value)
  if (record === undefined) return undefined
  const result: Partial<Record<TabId, SidebarRightTabState>> = {}
  for (const [id, raw] of Object.entries(record)) {
    const tab = tabId(id)
    const state = recordOf(raw)
    if (!open.has(tab) || state === undefined) return undefined
    const payload = state.payload === undefined ? undefined : jsonValue(state.payload)
    const pin = state.pin === undefined ? undefined : pinState(state.pin)
    if (state.payload !== undefined && payload === undefined || state.pin !== undefined && pin === undefined) return undefined
    result[tab] = {
      ...payload === undefined ? {} : { payload },
      ...pin === undefined ? {} : { pin },
    }
  }
  return result
}

function validSharedIds(right: LayoutState, bottom: LayoutState, minted: number): boolean {
  const ids = [
    ...Object.keys(right.nodes),
    ...Object.keys(right.tabs),
    ...Object.keys(bottom.nodes),
    ...Object.keys(bottom.tabs),
  ]
  if (new Set(ids).size !== ids.length) return false
  let highest = 0
  for (const id of ids) {
    const match = /^(?:pane|split|tab)(\d+)$/.exec(id)
    if (match === null) return false
    highest = Math.max(highest, Number(match[1]))
  }
  return minted >= highest
}

/**
 * Decode one current-version official document.
 * @param value - parsed durable JSON.
 * @returns validated workbench state, or `undefined` for an unsupported or malformed document.
 */
export function decodeSidebarWorkbench(value: unknown): SurfaceState | undefined {
  const record = recordOf(value)
  if (record?.version !== SIDEBAR_WORKBENCH_VERSION || !Number.isSafeInteger(record.minted) || (record.minted as number) < 0) {
    return undefined
  }
  const right = layoutState(recordOf(record.right)?.layout)
  const bottom = layoutState(recordOf(record.bottom)?.layout)
  if (
    right === undefined || bottom === undefined || !finite(record.bottomHeight)
    || record.bottomHeight < BOTTOM_HEIGHT_MIN || typeof record.bottomOpenedOnce !== 'boolean'
  ) return undefined
  if (!validSharedIds(right, bottom, record.minted as number)) return undefined
  const open = new Set([...Object.values(right.tabs), ...Object.values(bottom.tabs)].map(tab => tab.id))
  const tabs = tabStates(record.tabs, open)
  const dataRecord = recordOf(record.data)
  const data = dataRecord === undefined ? undefined : jsonValue(dataRecord)
  if (tabs === undefined || data === undefined || Array.isArray(data) || data === null || typeof data !== 'object') return undefined
  return {
    layout: right,
    history: EMPTY_HISTORY,
    bottom: { layout: bottom, history: EMPTY_HISTORY },
    minted: record.minted as number,
    bottomHeight: record.bottomHeight,
    bottomOpenedOnce: record.bottomOpenedOnce,
    tabs,
    data,
  }
}

/**
 * Encode durable workbench state without process-local reversible history.
 * @param surface - one Session's complete workbench state.
 * @param migrated - whether this document was adopted from the legacy key.
 * @returns the serialized current-version document.
 */
export function encodeSidebarWorkbench(surface: SurfaceState, migrated = false): string {
  const document: PersistedDocument = {
    version: SIDEBAR_WORKBENCH_VERSION,
    right: { layout: surface.layout },
    bottom: { layout: surface.bottom.layout },
    minted: surface.minted,
    bottomHeight: surface.bottomHeight,
    bottomOpenedOnce: surface.bottomOpenedOnce,
    tabs: surface.tabs,
    data: surface.data,
    ...(migrated ? { migratedFrom: LEGACY_SIDEBAR_STORAGE_PREFIX } : {}),
  }
  return JSON.stringify(document)
}

class LegacyIds {
  count = 0

  next(prefix: string): string {
    this.count += 1
    return `${prefix}${this.count}`
  }
}

interface LegacyBuild {
  readonly nodes: Partial<Record<NodeId, LayoutNode>>
  readonly tabs: Partial<Record<TabId, TabRecord>>
  readonly metadata: Partial<Record<TabId, SidebarRightTabState>>
  readonly panes: Map<string, PaneId>
  readonly tabIds: Map<string, TabId>
  readonly ids: LegacyIds
  readonly sessionId: SessionId
  readonly seedTitle: () => string
}

function legacyTab(value: unknown, build: LegacyBuild): TabRecord | undefined {
  const record = recordOf(value)
  if (record === undefined || typeof record.id !== 'string' || typeof record.type !== 'string' || typeof record.title !== 'string') {
    return undefined
  }
  if (record.type === 'diff') return undefined
  const kind = record.type === 'explorer' ? 'editor' : record.type
  const id = tabId(build.ids.next('tab'))
  build.tabIds.set(record.id, id)
  const contentId = kind === 'editor' && typeof record.path === 'string'
    ? fileAddressFor(build.sessionId, undefined, record.path)
    : pageInstanceAddress(kind, record.id)
  const tab = { id, kind, contentId, title: record.type === 'explorer' ? 'Files' : record.title }
  const payload = record.meta === undefined ? undefined : jsonValue(record.meta)
  if (record.meta !== undefined && payload === undefined) return undefined
  const rawPin = recordOf(record.pin)
  const pin = kind === 'terminal' && rawPin !== undefined && (rawPin.scope === 'workspace' || rawPin.scope === 'global')
    ? {
      scope: rawPin.scope,
      homeSessionId: build.sessionId,
      ...(typeof rawPin.homeCwd === 'string' ? { homeCwd: rawPin.homeCwd } : {}),
    } satisfies SidebarRightTabPin
    : undefined
  if (payload !== undefined || pin !== undefined) {
    build.metadata[id] = {
      ...payload === undefined ? {} : { payload },
      ...pin === undefined ? {} : { pin },
    }
  }
  build.tabs[id] = tab
  return tab
}

function legacyNode(value: unknown, build: LegacyBuild): NodeId | undefined {
  const record = recordOf(value)
  if (record === undefined || typeof record.id !== 'string') return undefined
  if (record.kind === 'leaf') {
    if (!Array.isArray(record.tabs)) return undefined
    const id = paneId(build.ids.next('pane'))
    build.panes.set(record.id, id)
    const tabs: TabRecord[] = []
    for (const raw of record.tabs) {
      const tab = legacyTab(raw, build)
      if (tab !== undefined) tabs.push(tab)
      else if (recordOf(raw)?.type !== 'diff') return undefined
    }
    if (tabs.length === 0) {
      const guide = makeGuideTab(tabId(build.ids.next('tab')), build.seedTitle())
      build.tabs[guide.id] = guide
      tabs.push(guide)
    }
    const activeLegacy = typeof record.active === 'string' ? record.active : undefined
    const active = activeLegacy === undefined ? tabs.at(-1)?.id : build.tabIds.get(activeLegacy) ?? tabs.at(-1)?.id
    build.nodes[id] = { kind: 'pane', id, host: 'dock', tabs: tabs.map(tab => tab.id), activeTabId: active, rect: undefined }
    return id
  }
  if (record.kind !== 'split' || (record.dir !== 'row' && record.dir !== 'col') || !Array.isArray(record.children)) return undefined
  const sizes = numbers(record.sizes)
  if (sizes === undefined || sizes.length !== record.children.length || record.children.length < 2) return undefined
  if (sizes.some(size => size <= 0)) return undefined
  const children: NodeId[] = []
  for (const child of record.children) {
    const id = legacyNode(child, build)
    if (id === undefined) return undefined
    children.push(id)
  }
  const sum = sizes.reduce((total, size) => total + size, 0)
  const id = splitId(build.ids.next('split'))
  build.nodes[id] = {
    kind: 'split', id, axis: record.dir === 'row' ? 'row' : 'column', children,
    sizes: sizes.map(size => size / sum),
  }
  return id
}

function legacyDock(
  value: unknown,
  expanded: boolean,
  build: LegacyBuild,
  activeLegacy: unknown,
): LayoutState | undefined {
  const rootId = legacyNode(value, build)
  if (rootId === undefined) return undefined
  const fallback = Object.values(build.nodes).find((node): node is PaneNode => node?.kind === 'pane')
  if (fallback === undefined) return undefined
  const activePaneId = typeof activeLegacy === 'string' ? build.panes.get(activeLegacy) ?? fallback.id : fallback.id
  return {
    nodes: build.nodes as Readonly<Record<NodeId, LayoutNode>>,
    tabs: build.tabs as Readonly<Record<TabId, TabRecord>>,
    rootId,
    floats: [],
    activePaneId,
    expanded,
    mode: 'push',
  }
}

/**
 * Convert a legacy Better Sidebar document without mutating its storage key.
 * @param value - parsed legacy JSON.
 * @param sessionId - Session that owns the adopted state.
 * @param seedTitle - localized title for empty panes created during conversion.
 * @returns converted official state, or `undefined` when the legacy document is malformed.
 */
export function migrateLegacySidebar(
  value: unknown,
  sessionId: SessionId,
  seedTitle: () => string,
): SurfaceState | undefined {
  const record = recordOf(value)
  if (record === undefined || typeof record.panelOpen !== 'boolean') return undefined
  const ids = new LegacyIds()
  const rightBuild: LegacyBuild = {
    nodes: {}, tabs: {}, metadata: {}, panes: new Map(), tabIds: new Map(), ids, sessionId, seedTitle,
  }
  const right = legacyDock(record.splits, record.panelOpen, rightBuild, record.activePane)
  if (right === undefined) return undefined
  const bottomBuild: LegacyBuild = {
    nodes: {}, tabs: {}, metadata: {}, panes: new Map(), tabIds: new Map(), ids, sessionId, seedTitle,
  }
  const bottomSource = record.bottomSplits ?? { kind: 'leaf', id: 'legacy-bottom', tabs: [], active: null }
  const bottom = legacyDock(bottomSource, record.bottomOpen === true, bottomBuild, record.activePane)
  if (bottom === undefined) return undefined
  const nodes = { ...right.nodes }
  const tabs = { ...right.tabs }
  const floats: PaneId[] = []
  if (Array.isArray(record.floats)) {
    for (const raw of record.floats) {
      const item = recordOf(raw)
      if (item === undefined || !finite(item.x) || !finite(item.y) || !finite(item.w) || !finite(item.h)) continue
      const tab = legacyTab(item.tab, rightBuild)
      if (tab === undefined) continue
      const id = paneId(ids.next('pane'))
      nodes[id] = {
        kind: 'pane', id, host: 'float', tabs: [tab.id], activeTabId: tab.id,
        rect: { x: item.x, y: item.y, width: Math.max(320, item.w), height: Math.max(200, item.h) },
      }
      tabs[tab.id] = tab
      floats.push(id)
    }
  }
  const rightWithFloats: LayoutState = {
    ...right,
    nodes,
    tabs,
    floats,
    activePaneId: floats.at(-1) ?? right.activePaneId,
  }
  const rawHeight = finite(record.bottomHeight) ? Math.round(record.bottomHeight) : BOTTOM_HEIGHT_DEFAULT
  const legacyData = jsonValue({
    ...(Array.isArray(record.closedSideThreads) ? { closedSideThreads: record.closedSideThreads } : {}),
    ...(Array.isArray(record.expanded) ? { expanded: record.expanded } : {}),
    ...(finite(record.nextTerminal) ? { nextTerminal: record.nextTerminal } : {}),
    ...(finite(record.nextBrowser) ? { nextBrowser: record.nextBrowser } : {}),
  })
  return {
    layout: rightWithFloats,
    history: EMPTY_HISTORY,
    bottom: { layout: bottom, history: EMPTY_HISTORY },
    minted: ids.count,
    bottomHeight: Math.max(BOTTOM_HEIGHT_MIN, rawHeight),
    bottomOpenedOnce: record.bottomOpenedOnce === true,
    tabs: { ...rightBuild.metadata, ...bottomBuild.metadata },
    data: legacyData === undefined || Array.isArray(legacyData) || legacyData === null || typeof legacyData !== 'object'
      ? {}
      : { 'legacy.ui-better-sidebar': legacyData },
  }
}

/** Browser adapter owning load, migration-before-selection, save, and reset. */
export class LocalSidebarWorkbenchPersistence implements SidebarWorkbenchPersistence {
  private readonly blocked = new Set<string>()

  /** @param storage - browser storage; omitted disables persistence. */
  constructor(private readonly storage: SidebarWorkbenchStorage | undefined) {}

  load(sessionId: string, seedTitle: () => string): SurfaceState | undefined {
    if (this.storage === undefined) return undefined
    const key = `${SIDEBAR_WORKBENCH_STORAGE_PREFIX}:${sessionId}`
    let raw: string | null
    try {
      raw = this.storage.getItem(key)
    } catch (error) {
      console.error('sidebarRight: workbench persistence read failed:', error)
      return undefined
    }
    if (raw !== null) {
      try {
        const parsed: unknown = JSON.parse(raw)
        const decoded = decodeSidebarWorkbench(parsed)
        if (decoded !== undefined) return decoded
      } catch {
        // The blocked state below preserves the exact raw value for recovery.
      }
      this.blocked.add(sessionId)
      return undefined
    }
    const legacyKey = `${LEGACY_SIDEBAR_STORAGE_PREFIX}:${sessionId}`
    try {
      const legacyRaw = this.storage.getItem(legacyKey)
      if (legacyRaw === null) return undefined
      const migrated = migrateLegacySidebar(JSON.parse(legacyRaw) as unknown, sessionId as SessionId, seedTitle)
      if (migrated === undefined) return undefined
      this.storage.setItem(key, encodeSidebarWorkbench(migrated, true))
      return migrated
    } catch (error) {
      this.blocked.add(sessionId)
      console.error('sidebarRight: legacy workbench migration failed:', error)
      return undefined
    }
  }

  save(sessionId: string, surface: SurfaceState): void {
    if (this.storage === undefined || this.blocked.has(sessionId)) return
    try {
      this.storage.setItem(`${SIDEBAR_WORKBENCH_STORAGE_PREFIX}:${sessionId}`, encodeSidebarWorkbench(surface))
    } catch (error) {
      console.error('sidebarRight: workbench persistence write failed:', error)
    }
  }

  clear(sessionId: string): void {
    this.blocked.delete(sessionId)
    try {
      this.storage?.removeItem(`${SIDEBAR_WORKBENCH_STORAGE_PREFIX}:${sessionId}`)
    } catch {
      // A storage cleanup failure leaves the recoverable document intact.
    }
  }
}

/** Durable adapter consumed by the official store handle. */
export interface SidebarWorkbenchPersistence {
  load(sessionId: string, seedTitle: () => string): SurfaceState | undefined
  save(sessionId: string, surface: SurfaceState): void
  clear(sessionId: string): void
}

/**
 * Create the browser adapter without reading storage during plugin apply.
 * @returns the lazy local-storage persistence adapter.
 */
export function createLocalSidebarWorkbenchPersistence(): SidebarWorkbenchPersistence {
  return new LocalSidebarWorkbenchPersistence(typeof localStorage === 'undefined' ? undefined : localStorage)
}
