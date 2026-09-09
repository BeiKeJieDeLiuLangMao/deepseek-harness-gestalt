/** Official workbench state over the pure DockKit planners. */
import { defineStore, type EngineStoreHandle, type EngineStoreInstance } from '@deepseek-ai/dsh-client-store'
import type {
  DockMode, DockZone, FloatRect, History, LayoutOp, LayoutState, Mint, PaneId, SplitId, TabId, TabRecord,
} from '@deepseek-ai/dsh-client-ui-dockkit'
import {
  activeDockPaneId, createInitialState, dockPaneIds, EMPTY_HISTORY, findPaneContentTab, findTabPane, getPane,
  planDropTab, planDuplicateTab, planFloatTab, planOpenContent, planPlaceTab, planResizeSplit, planSetExpanded,
  planSetMode, planSettle, planSplitPane, planUnfloatPane, record, replay, stepBack, stepForward,
} from '@deepseek-ai/dsh-client-ui-dockkit'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { SidebarRightTabPayload, SidebarRightTabPin, SidebarRightTabState } from './contract/payload.ts'
import { GUIDE_KIND, pageAddress, type SidebarRightSeed } from './contract/seed.ts'
import type { SidebarWorkbenchPersistence } from './persistence.ts'

/** A docked official workbench surface. Floats belong to the right surface. */
export type SidebarWorkbenchSurface = 'right' | 'bottom'

/** One DockKit surface and its reversible sequence. */
export interface DockSurfaceState {
  readonly layout: LayoutState
  readonly history: History
}

/** One Session's complete official workbench state. */
export interface SurfaceState extends DockSurfaceState {
  readonly bottom: DockSurfaceState
  /** Shared id cursor for right, bottom, and right-side floats. */
  readonly minted: number
  readonly bottomHeight: number
  readonly bottomOpenedOnce: boolean
  /** Persistent extension state keyed by occurrence id. */
  readonly tabs: Readonly<Partial<Record<TabId, SidebarRightTabState>>>
  /** Namespaced Session-level extension data retained by the official owner. */
  readonly data: Readonly<Record<string, JsonValue>>
}

/** Every materialized Session surface, keyed by Session id. */
export interface SidebarRightState {
  bySession: Record<string, SurfaceState>
}

/** Bottom surface geometry owned by the workbench state, in CSS pixels. */
export const BOTTOM_HEIGHT_DEFAULT = 220
/** Minimum usable bottom surface height. */
export const BOTTOM_HEIGHT_MIN = 120

/** What the navigation controller asks the store to open. */
export interface OpenContentIntent {
  readonly kind: string
  readonly contentId: string
  readonly title: string
  readonly surface?: SidebarWorkbenchSurface
  readonly paneId?: PaneId
  readonly index?: number
  readonly replaceTab?: TabId
  readonly revealIfOpened?: boolean
  /** Whether placement focuses and expands the target surface; defaults to true. */
  readonly activate?: boolean
  readonly payload?: SidebarRightTabPayload
  readonly pin?: SidebarRightTabPin
  /** Reset reversible history around runtime-owned resource creation. */
  readonly checkpoint?: boolean
}

/** Persistent record fields an extension may change without replacing its occurrence. */
export interface UpdateTabIntent {
  readonly title?: string
  readonly payload?: SidebarRightTabPayload | undefined
  readonly pin?: SidebarRightTabPin | undefined
}

/** Result of looking up a record across both official surfaces. */
export interface LocatedTab {
  readonly surface: SidebarWorkbenchSurface
  readonly record: TabRecord
}

type SurfacePlan = (state: LayoutState, mint: Mint) => readonly LayoutOp[]
type HistoryStepper =
  (history: History, state: LayoutState) => { history: History; state: LayoutState } | undefined

function seedRecord(id: TabId, seed: () => SidebarRightSeed): TabRecord {
  const initial = seed()
  return { id, kind: initial.kind, title: initial.title, contentId: pageAddress(initial.kind) }
}

/** Store write set. Public UI writes still enter through `ctx.sidebarRight`. */
export type SidebarRightActions = {
  open: (draft: SidebarRightState, sessionId: string) => void
  setExpanded: (draft: SidebarRightState, sessionId: string, expanded: boolean) => void
  toggleExpanded: (draft: SidebarRightState, sessionId: string) => void
  setMode: (draft: SidebarRightState, sessionId: string, mode: DockMode) => void
  setSurfaceExpanded: (draft: SidebarRightState, sessionId: string, surface: SidebarWorkbenchSurface, expanded: boolean) => void
  setSurfaceMode: (draft: SidebarRightState, sessionId: string, surface: SidebarWorkbenchSurface, mode: DockMode) => void
  setBottomHeight: (draft: SidebarRightState, sessionId: string, height: number, viewportHeight: number) => void
  markBottomOpened: (draft: SidebarRightState, sessionId: string) => void
  splitPane: (draft: SidebarRightState, sessionId: string, paneId?: PaneId, settled?: (paneId: PaneId) => void) => void
  splitSurfacePane: (
    draft: SidebarRightState, sessionId: string, surface: SidebarWorkbenchSurface,
    paneId?: PaneId, settled?: (paneId: PaneId) => void,
  ) => void
  openContent: (
    draft: SidebarRightState, sessionId: string, intent: OpenContentIntent, settled: (tabId: TabId) => void,
  ) => void
  duplicateTab: (draft: SidebarRightState, sessionId: string, tabId: TabId) => void
  closeTab: (draft: SidebarRightState, sessionId: string, tabId: TabId) => void
  closeTabs: (draft: SidebarRightState, sessionId: string, tabIds: readonly TabId[], checkpoint: boolean) => void
  updateTab: (draft: SidebarRightState, sessionId: string, tabId: TabId, patch: UpdateTabIntent) => void
  updateData: (draft: SidebarRightState, sessionId: string, key: string, value: JsonValue | undefined) => void
  replaceDock: (
    draft: SidebarRightState, sessionId: string, surface: SidebarWorkbenchSurface, next: DockSurfaceState,
  ) => void
  focusTab: (draft: SidebarRightState, sessionId: string, tabId: TabId) => void
  focusPane: (draft: SidebarRightState, sessionId: string, paneId: PaneId) => void
  placeTab: (draft: SidebarRightState, sessionId: string, tabId: TabId, toPaneId: PaneId, index: number) => void
  dropTab: (draft: SidebarRightState, sessionId: string, tabId: TabId, paneId: PaneId, zone: DockZone) => void
  floatTab: (draft: SidebarRightState, sessionId: string, tabId: TabId, rect?: FloatRect) => void
  unfloatPane: (draft: SidebarRightState, sessionId: string, paneId: PaneId) => void
  moveFloat: (draft: SidebarRightState, sessionId: string, paneId: PaneId, x: number, y: number) => void
  resizeFloat: (draft: SidebarRightState, sessionId: string, paneId: PaneId, rect: FloatRect) => void
  resizeSplit: (draft: SidebarRightState, sessionId: string, splitId: SplitId, sizes: readonly number[]) => void
  undo: (draft: SidebarRightState, sessionId: string, surface?: SidebarWorkbenchSurface) => void
  redo: (draft: SidebarRightState, sessionId: string, surface?: SidebarWorkbenchSurface) => void
  reset: (draft: SidebarRightState, sessionId: string) => void
}

function counting(from: number): { mint: Mint; used: () => number } {
  let counter = from
  const mint = ((prefix: string): string => {
    counter += 1
    return `${prefix}${counter}`
  }) as Mint
  return { mint, used: () => counter }
}

/**
 * Create a Session workbench with independent right and bottom layouts.
 * @param seed - current default page.
 * @param expanded - whether the fresh right surface starts expanded.
 * @returns the fresh state with a shared id cursor.
 */
export function createSurface(seed: () => SidebarRightSeed, expanded = false): SurfaceState {
  const counter = counting(0)
  const make = (seeded: boolean): DockSurfaceState => ({
    layout: createInitialState({ next: counter.mint }, seeded ? id => seedRecord(id, seed) : undefined),
    history: EMPTY_HISTORY,
  })
  const created = make(expanded)
  const right = { ...created, layout: { ...created.layout, expanded } }
  return {
    ...right,
    bottom: make(false),
    minted: counter.used(),
    bottomHeight: BOTTOM_HEIGHT_DEFAULT,
    bottomOpenedOnce: false,
    tabs: {},
    data: {},
  }
}

/**
 * Locate a tab across the complete workbench.
 * @param surface - Session state to search.
 * @param tabId - occurrence identity.
 * @returns the owning surface and record, or `undefined` when absent.
 */
export function locateTab(surface: SurfaceState, tabId: TabId): LocatedTab | undefined {
  const right = surface.layout.tabs[tabId]
  if (right !== undefined) return { surface: 'right', record: right }
  const bottom = surface.bottom.layout.tabs[tabId]
  return bottom === undefined ? undefined : { surface: 'bottom', record: bottom }
}

/**
 * List every record across right and bottom once.
 * @param surface - Session workbench state.
 * @returns records from the right surface followed by bottom records.
 */
export function workbenchTabs(surface: SurfaceState): readonly TabRecord[] {
  return [...Object.values(surface.layout.tabs), ...Object.values(surface.bottom.layout.tabs)]
}

function dock(surface: SurfaceState, target: SidebarWorkbenchSurface): DockSurfaceState {
  return target === 'right' ? { layout: surface.layout, history: surface.history } : surface.bottom
}

function withDock(surface: SurfaceState, target: SidebarWorkbenchSurface, next: DockSurfaceState): SurfaceState {
  return target === 'right' ? { ...surface, ...next } : { ...surface, bottom: next }
}

function panePage(state: LayoutState, paneId: PaneId, kind: string): TabId | undefined {
  return findPaneContentTab(state, paneId, pageAddress(kind), kind)
}

function pageKind(state: LayoutState, tabId: TabId): string | undefined {
  const tab = state.tabs[tabId]
  return tab !== undefined && tab.contentId === pageAddress(tab.kind) ? tab.kind : undefined
}

/** Whether a tab stands alone on the docked part of one surface. */
export function soleDockedTab(state: LayoutState, tabId: TabId): boolean {
  const pane = findTabPane(state, tabId)
  return pane.host === 'dock' && pane.tabs.length === 1 && dockPaneIds(state).length === 1
}

/** Whether an explicit close may remove a tab. */
export function canCloseTab(surface: DockSurfaceState, tabId: TabId): boolean {
  const tab = surface.layout.tabs[tabId]
  return tab !== undefined && !(tab.kind === GUIDE_KIND && soleDockedTab(surface.layout, tabId))
}

function planFocusTab(state: LayoutState, tabId: TabId): readonly LayoutOp[] {
  const pane = findTabPane(state, tabId)
  return pane.activeTabId === tabId && state.activePaneId === pane.id ? [] : [{ type: 'focusTab', tabId }]
}

function planFocusPane(state: LayoutState, paneId: PaneId): readonly LayoutOp[] {
  return state.activePaneId === paneId ? [] : [{ type: 'focusPane', paneId }]
}

/** Preserve every pane's selection and the global focus around an inactive open. */
function restoreFocus(state: LayoutState): LayoutOp {
  const paneActiveTabs = Object.fromEntries(
    Object.values(state.nodes)
      .filter(node => node.kind === 'pane')
      .map(pane => [pane.id, pane.activeTabId]),
  ) as Readonly<Record<PaneId, TabId | undefined>>
  return { type: 'restoreFocus', activePaneId: state.activePaneId, floats: state.floats, paneActiveTabs }
}

function arriving(
  state: LayoutState,
  tabId: TabId,
  toPaneId: PaneId,
  otherwise: () => readonly LayoutOp[],
): readonly LayoutOp[] {
  const kind = pageKind(state, tabId)
  if (kind === undefined) return otherwise()
  const existing = panePage(state, toPaneId, kind)
  if (existing === undefined || existing === tabId) return otherwise()
  return [{ type: 'closeTab', tabId }, { type: 'focusTab', tabId: existing }]
}

function retainTabState(surface: SurfaceState): SurfaceState {
  const open = new Set(workbenchTabs(surface).map(tab => tab.id))
  const entries = Object.entries(surface.tabs).filter(([id]) => open.has(id as TabId))
  if (entries.length === Object.keys(surface.tabs).length) return surface
  return { ...surface, tabs: Object.fromEntries(entries) }
}

function advance(
  surface: SurfaceState,
  target: SidebarWorkbenchSurface,
  plan: SurfacePlan,
  seed: () => SidebarRightSeed,
  checkpoint = false,
): SurfaceState {
  const current = dock(surface, target)
  const counter = counting(surface.minted)
  const planned = plan(current.layout, counter.mint)
  if (planned.length === 0) return surface
  const after = replay(current.layout, planned)
  const settled = planSettle(after, counter.mint, after.expanded ? id => seedRecord(id, seed) : undefined)
  const operations = [...planned, ...settled]
  const stepped = checkpoint
    ? { state: replay(current.layout, operations), history: EMPTY_HISTORY }
    : record(current.history, current.layout, operations)
  return retainTabState(withDock({ ...surface, minted: counter.used() }, target, {
    layout: stepped.state,
    history: stepped.history,
  }))
}

function seat(
  state: SidebarRightState,
  sessionId: string,
  seed: () => SidebarRightSeed,
  next: (surface: SurfaceState) => SurfaceState,
): Record<string, SurfaceState> {
  const existing = state.bySession[sessionId]
  const updated = next(existing ?? createSurface(seed))
  return updated === existing ? state.bySession : { ...state.bySession, [sessionId]: updated }
}

function targetFor(surface: SurfaceState, paneId: PaneId | undefined, tabId: TabId | undefined): SidebarWorkbenchSurface {
  if (tabId !== undefined) return locateTab(surface, tabId)?.surface ?? 'right'
  if (paneId !== undefined && surface.bottom.layout.nodes[paneId] !== undefined) return 'bottom'
  return 'right'
}

function stepped(surface: SurfaceState, target: SidebarWorkbenchSurface, step: HistoryStepper): SurfaceState {
  const current = dock(surface, target)
  const moved = step(current.history, current.layout)
  return moved === undefined
    ? surface
    : retainTabState(withDock(surface, target, { layout: moved.state, history: moved.history }))
}

function updateRecord(layout: LayoutState, tabId: TabId, title: string | undefined): LayoutState {
  const record = layout.tabs[tabId]
  if (record === undefined || title === undefined || record.title === title) return layout
  return { ...layout, tabs: { ...layout.tabs, [tabId]: { ...record, title } } }
}

function actionTable(seed: () => SidebarRightSeed): SidebarRightActions {
  const setExpanded = (
    d: SidebarRightState, sessionId: string, surface: SidebarWorkbenchSurface, expanded: boolean,
  ): void => {
    d.bySession = seat(d, sessionId, seed, s =>
      advance(s, surface, state => planSetExpanded(state, expanded), seed))
  }
  const split = (
    d: SidebarRightState,
    sessionId: string,
    surface: SidebarWorkbenchSurface,
    paneId?: PaneId,
    settled?: (paneId: PaneId) => void,
  ): void => {
    d.bySession = seat(d, sessionId, seed, (s) => {
      const before = new Set(dockPaneIds(dock(s, surface).layout))
      const next = advance(s, surface, (state, mint) => dockPaneIds(state).length >= 2
        || getPane(state, paneId ?? activeDockPaneId(state)).tabs.length === 0
        ? []
        : planSplitPane(state, mint, paneId, id => seedRecord(id, seed)), seed)
      if (settled !== undefined && next !== s) {
        for (const id of dockPaneIds(dock(next, surface).layout)) if (!before.has(id)) settled(id)
      }
      return next
    })
  }
  return {
    open: (d, sessionId) => { d.bySession = seat(d, sessionId, seed, surface => surface) },
    setExpanded: (d, sessionId, expanded) => { setExpanded(d, sessionId, 'right', expanded) },
    toggleExpanded: (d, sessionId) => {
      d.bySession = seat(d, sessionId, seed, s =>
        advance(s, 'right', state => planSetExpanded(state, !state.expanded), seed))
    },
    setMode: (d, sessionId, mode) => {
      d.bySession = seat(d, sessionId, seed, s =>
        advance(s, 'right', state => planSetMode(state, mode), seed))
    },
    setSurfaceExpanded: setExpanded,
    setSurfaceMode: (d, sessionId, surface, mode) => {
      d.bySession = seat(d, sessionId, seed, s =>
        advance(s, surface, state => planSetMode(state, mode), seed))
    },
    setBottomHeight: (d, sessionId, height, viewportHeight) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const maximum = Math.max(BOTTOM_HEIGHT_MIN, Math.round(viewportHeight) - 280)
        const next = Math.max(BOTTOM_HEIGHT_MIN, Math.min(maximum, Math.round(height)))
        return next === s.bottomHeight ? s : { ...s, bottomHeight: next }
      })
    },
    markBottomOpened: (d, sessionId) => {
      d.bySession = seat(d, sessionId, seed, s =>
        s.bottomOpenedOnce ? s : { ...s, bottomOpenedOnce: true })
    },
    splitPane: (d, sessionId, paneId, settled) => { split(d, sessionId, 'right', paneId, settled) },
    splitSurfacePane: split,
    openContent: (d, sessionId, intent, settled) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const surface = intent.surface ?? targetFor(s, intent.paneId, intent.replaceTab)
        let settledTab: TabId | undefined
        let next = advance(s, surface, (state, mint) => {
          const { kind, contentId, title, replaceTab: replace } = intent
          const ops: LayoutOp[] = intent.activate === false ? [] : [...planSetExpanded(state, true)]
          const replaced = replace === undefined || state.tabs[replace] === undefined ? undefined : findTabPane(state, replace)
          const lent = replaced?.host === 'dock' ? replaced : undefined
          const paneId = lent?.id ?? intent.paneId
          const index = lent === undefined || replace === undefined ? intent.index : lent.tabs.indexOf(replace)
          const page = contentId === pageAddress(kind)
          const held = page ? panePage(state, paneId ?? activeDockPaneId(state), kind) : undefined
          const planned = held !== undefined
            ? { ops: [{ type: 'focusTab' as const, tabId: held }], tabId: held }
            : planOpenContent(state, mint, {
              kind,
              contentId,
              title,
              ...paneId === undefined ? {} : { paneId },
              ...index === undefined ? {} : { index },
              ...page
                ? { revealIfOpened: false }
                : intent.revealIfOpened === undefined ? {} : { revealIfOpened: intent.revealIfOpened },
            })
          ops.push(...planned.ops)
          if (intent.activate === false) ops.push(restoreFocus(state))
          if (replace !== undefined && state.tabs[replace] !== undefined && replace !== planned.tabId) {
            ops.push({ type: 'closeTab', tabId: replace })
          }
          settledTab = planned.tabId
          return ops
        }, seed, intent.checkpoint)
        if (settledTab === undefined) return next
        const current = next.tabs[settledTab] ?? {}
        const tabState: SidebarRightTabState = {
          ...current,
          ...intent.payload === undefined ? {} : { payload: intent.payload },
          ...intent.pin === undefined ? {} : { pin: intent.pin },
        }
        if (Object.keys(tabState).length > 0 && tabState !== current) {
          next = { ...next, tabs: { ...next.tabs, [settledTab]: tabState } }
        }
        settled(settledTab)
        return next
      })
    },
    duplicateTab: (d, sessionId, tabId) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const found = locateTab(s, tabId)
        if (found === undefined) return s
        let copied: TabId | undefined
        let next = advance(s, found.surface, (state, mint) => {
          if (pageKind(state, tabId) !== undefined) return []
          const planned = planDuplicateTab(state, mint, tabId)
          copied = planned.tabId
          return planned.ops
        }, seed)
        const metadata = s.tabs[tabId]
        if (copied !== undefined && metadata !== undefined) next = { ...next, tabs: { ...next.tabs, [copied]: metadata } }
        return next
      })
    },
    closeTab: (d, sessionId, tabId) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const found = locateTab(s, tabId)
        if (found === undefined) return s
        const current = dock(s, found.surface)
        return advance(s, found.surface, (state) => {
          if (!canCloseTab(current, tabId)) return []
          if (!soleDockedTab(state, tabId)) return [{ type: 'closeTab', tabId }]
          return [{ type: 'closeTab', tabId }, ...planSetMode(state, 'push'), ...planSetExpanded(state, false)]
        }, seed)
      })
    },
    closeTabs: (d, sessionId, tabIds, checkpoint) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        let next = s
        for (const surface of ['right', 'bottom'] as const) {
          const layout = dock(next, surface).layout
          const present = tabIds.filter(tabId => layout.tabs[tabId] !== undefined)
          if (present.length > 0) {
            next = advance(next, surface, () => present.map(tabId => ({ type: 'closeTab' as const, tabId })), seed, checkpoint)
          }
        }
        return next
      })
    },
    updateTab: (d, sessionId, tabId, patch) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const found = locateTab(s, tabId)
        if (found === undefined) return s
        const current = s.tabs[tabId] ?? {}
        const metadata: { payload?: SidebarRightTabPayload; pin?: SidebarRightTabPin } = { ...current }
        if (Object.hasOwn(patch, 'payload')) {
          if (patch.payload === undefined) delete metadata.payload
          else metadata.payload = patch.payload
        }
        if (Object.hasOwn(patch, 'pin')) {
          if (patch.pin === undefined) delete metadata.pin
          else metadata.pin = patch.pin
        }
        const previousDock = dock(s, found.surface)
        const layout = updateRecord(previousDock.layout, tabId, patch.title)
        const next = withDock(s, found.surface, { ...previousDock, layout })
        const tabs = Object.keys(metadata).length === 0
          ? Object.fromEntries(Object.entries(next.tabs).filter(([id]) => id !== tabId)) as Partial<Record<TabId, SidebarRightTabState>>
          : { ...next.tabs, [tabId]: metadata }
        return layout === previousDock.layout && tabs === s.tabs ? s : { ...next, tabs }
      })
    },
    updateData: (d, sessionId, key, value) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        if (value === undefined && !Object.hasOwn(s.data, key)) return s
        const data = value === undefined
          ? Object.fromEntries(Object.entries(s.data).filter(([candidate]) => candidate !== key))
          : { ...s.data, [key]: value }
        return { ...s, data }
      })
    },
    replaceDock: (d, sessionId, surface, next) => {
      d.bySession = seat(d, sessionId, seed, current => retainTabState(withDock(current, surface, next)))
    },
    focusTab: (d, sessionId, tabId) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const found = locateTab(s, tabId)
        return found === undefined ? s : advance(s, found.surface, state => planFocusTab(state, tabId), seed)
      })
    },
    focusPane: (d, sessionId, paneId) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const surface = targetFor(s, paneId, undefined)
        return dock(s, surface).layout.nodes[paneId] === undefined
          ? s
          : advance(s, surface, state => planFocusPane(state, paneId), seed)
      })
    },
    placeTab: (d, sessionId, tabId, toPaneId, index) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const found = locateTab(s, tabId)
        const target = targetFor(s, toPaneId, undefined)
        if (found === undefined || found.surface !== target) return s
        return advance(s, target, state => arriving(
          state, tabId, toPaneId, () => planPlaceTab(state, tabId, toPaneId, index),
        ), seed)
      })
    },
    dropTab: (d, sessionId, tabId, paneId, zone) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const found = locateTab(s, tabId)
        const target = targetFor(s, paneId, undefined)
        if (found === undefined || found.surface !== target) return s
        return advance(s, target, (state, mint) => {
          if (zone === 'top' || zone === 'bottom') return []
          if (zone !== 'center' && dockPaneIds(state).length >= 2) return []
          const plan = (): readonly LayoutOp[] => planDropTab(state, mint, tabId, paneId, zone, id => seedRecord(id, seed))
          return zone === 'center' ? arriving(state, tabId, paneId, plan) : plan()
        }, seed)
      })
    },
    floatTab: (d, sessionId, tabId, rect) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const found = locateTab(s, tabId)
        if (found?.surface !== 'right') return s
        return advance(s, 'right', (state, mint) => planFloatTab(state, mint, tabId, rect).ops, seed)
      })
    },
    unfloatPane: (d, sessionId, paneId) => {
      d.bySession = seat(d, sessionId, seed, s => advance(s, 'right', (state) => {
        const floated = getPane(state, paneId).tabs[0]
        const plan = (): readonly LayoutOp[] => planUnfloatPane(state, paneId)
        return floated === undefined ? plan() : arriving(state, floated, activeDockPaneId(state), plan)
      }, seed))
    },
    moveFloat: (d, sessionId, paneId, x, y) => {
      d.bySession = seat(d, sessionId, seed, s =>
        advance(s, 'right', () => [{ type: 'moveFloat', paneId, x, y }], seed))
    },
    resizeFloat: (d, sessionId, paneId, rect) => {
      d.bySession = seat(d, sessionId, seed, s =>
        advance(s, 'right', () => [{ type: 'resizeFloat', paneId, rect }], seed))
    },
    resizeSplit: (d, sessionId, splitId, sizes) => {
      d.bySession = seat(d, sessionId, seed, (s) => {
        const surface = s.bottom.layout.nodes[splitId] === undefined ? 'right' : 'bottom'
        return advance(s, surface, () => planResizeSplit(splitId, sizes, 0.2), seed)
      })
    },
    undo: (d, sessionId, surface = 'right') => {
      d.bySession = seat(d, sessionId, seed, s => stepped(s, surface, stepBack))
    },
    redo: (d, sessionId, surface = 'right') => {
      d.bySession = seat(d, sessionId, seed, s => stepped(s, surface, stepForward))
    },
    reset: (d, sessionId) => { d.bySession = { ...d.bySession, [sessionId]: createSurface(seed) } },
  }
}

/** Called once when the handle materializes a Session store. */
export type SidebarRightStoreCreated = (
  sessionId: string,
  store: EngineStoreInstance<SidebarRightState, SidebarRightActions>,
) => void

/**
 * Create the shared official workbench store handle.
 * @param seed - default page read when a pane is minted.
 * @param persistence - versioned durable adapter; omitted in isolated tests.
 * @param created - adoption callback for each new scoped instance.
 * @param seedExpanded - whether a newly materialized, non-persisted wide Session starts open.
 * @returns the handle registered by both official surface seats.
 */
export function createSidebarRightStore(
  seed: () => SidebarRightSeed,
  persistence?: SidebarWorkbenchPersistence,
  created?: SidebarRightStoreCreated,
  seedExpanded: () => boolean = () => false,
): EngineStoreHandle<SidebarRightState, SidebarRightActions> {
  const spec = { init: (): SidebarRightState => ({ bySession: {} }), actions: actionTable(seed) }
  const base = defineStore(spec)
  const scoped = new Map<string, EngineStoreInstance<SidebarRightState, SidebarRightActions>>()
  return {
    spec,
    create(scopeKey) {
      if (scopeKey !== undefined) {
        const existing = scoped.get(scopeKey)
        if (existing !== undefined) return existing
      }
      const instance = base.create()
      if (scopeKey !== undefined) {
        const initial = persistence?.load(scopeKey, () => seed().title) ?? createSurface(seed, seedExpanded())
        instance.store.set({ bySession: { [scopeKey]: initial } })
        instance.subscribe(() => {
          const surface = instance.getSnapshot().bySession[scopeKey]
          if (surface !== undefined) persistence?.save(scopeKey, surface)
        })
      }
      const wrapped: EngineStoreInstance<SidebarRightState, SidebarRightActions> = {
        ...instance,
        clearPersisted() {
          instance.clearPersisted()
          if (scopeKey !== undefined) {
            persistence?.clear(scopeKey)
            if (scoped.get(scopeKey) === wrapped) scoped.delete(scopeKey)
          }
        },
      }
      if (scopeKey !== undefined) {
        scoped.set(scopeKey, wrapped)
        created?.(scopeKey, wrapped)
      }
      return wrapped
    },
  }
}
