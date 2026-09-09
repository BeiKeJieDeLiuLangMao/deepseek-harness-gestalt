/**
 * `ctx.sidebarRight`: what other plugins may ask of this column.
 *
 * The surface is per session and its state lives in that session's store
 * instance, which the slot runtime mints per session and a root service cannot
 * reach on its own. Two paths lead in. The mounted seat publishes its binding —
 * session id, bound actions, its surface — for exactly as long as it is mounted,
 * and every command on the public face goes through that binding; a command
 * arriving with no seat mounted has no session to act on and fails loudly rather
 * than writing into a surface nobody is drawing. And the plugin adopts each
 * session's store instance as the runtime mints it, so the controller reaches
 * any session's store by id and syncs the Tab domain from that store's commits.
 *
 * A tab's own actions (`tabActions`) aim at the session the tab is in, not at
 * the mounted one: they run through that session's adopted store, so a callback
 * fired after the user switched sessions still lands where its tab is, and they
 * do nothing for a session whose store was never minted.
 *
 * `openResource` and `openTab` are the navigation controller, and every way
 * into the column is a call to one of them: the conversation's file links, a
 * tool row's line reference, the strip's add control, a guide entry box, a file
 * tree's rows. A resource is claimed through the registry by address; a page is
 * named by kind and recorded at the address this package composes for it. Both
 * hand the store one settled intent and record the navigation in the Tab
 * domain. Placement is the caller's option, never a type's property.
 *
 * Wiring follows `LayoutController.attachPanels`: the registration hands the
 * service its store actions, and the service is the face other plugins hold.
 */
import type { FloatRect, LayoutState, PaneId, TabId, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import { activeDockPaneId, canSplit, dockPaneIds, findTabPane, getPane, stepBack, stepForward } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import { snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import type { SidebarRightNavigationParams, SidebarRightResourceParams, SidebarRightTabParamsFor } from './contract/params.ts'
import type {
  SidebarRightTabPayload, SidebarRightTabPayloadFor, SidebarRightTabPin, SidebarRightTabState,
} from './contract/payload.ts'
import { pageAddress, pageInstanceAddress } from './contract/seed.ts'
import type {
  SidebarRightCloseReason, SidebarRightDescriptorContext, SidebarRightDescriptorTab, SidebarRightTabClaim,
  SidebarRightTabCloseContext, SidebarRightTabDefinition, SidebarRightTabRegistry,
} from './tab-registry.ts'
import { SidebarRightCloseCoordinator, type SidebarRightCloseOutcome } from './close-coordinator.ts'
import type { SidebarRightState, SidebarWorkbenchSurface, SurfaceState, UpdateTabIntent } from './stores.ts'
import { locateTab, workbenchTabs } from './stores.ts'
import type { createSidebarRightStore } from './stores.ts'
import { TabDomain, type PinResource } from './tab-domain.ts'

/** The seat's bound action set. */
export type SurfaceActions = BoundActions<ReturnType<typeof createSidebarRightStore>>

/** One session's store instance as the slot runtime minted it: its actions and its observable snapshot. */
export interface SidebarRightSurfaceStore {
  readonly actions: SurfaceActions
  getSnapshot(): SidebarRightState
  subscribe(listener: () => void): () => void
}

/** One adoption of a session's store; the token a release compares against. */
interface Adoption {
  readonly store: SidebarRightSurfaceStore
  readonly unsubscribe: () => void
}

/**
 * Create the public controller and the plugin-private store adoption callback.
 * Adoption subscribes without reconciling; the first store commit creates occurrences.
 * @param tabs - registered tab types.
 * @param pin - resource retention for an occurrence's lifetime.
 * @returns the controller and a callback releasing exactly its own adoption.
 */
export function createSidebarRightController(tabs: SidebarRightTabRegistry, pin: PinResource): {
  controller: SidebarRightController
  adopt: (sessionId: SessionId, store: SidebarRightSurfaceStore) => () => void
  materializeWith: (factory: (sessionId: SessionId) => SidebarRightSurfaceStore) => void
} {
  const adopted = new Map<SessionId, Adoption>()
  const controller = new SidebarRightController(tabs, pin, adopted)
  return {
    controller,
    adopt(sessionId, store) {
      adopted.get(sessionId)?.unsubscribe()
      const sync = (): void => {
        const surface = store.getSnapshot().bySession[sessionId]
        if (surface !== undefined) controller.syncSession(sessionId, surface)
      }
      const adoption: Adoption = { store, unsubscribe: store.subscribe(sync) }
      adopted.set(sessionId, adoption)
      sync()
      return () => {
        adoption.unsubscribe()
        if (adopted.get(sessionId) === adoption) adopted.delete(sessionId)
      }
    },
    materializeWith(factory) { controller.installMaterializer(factory) },
  }
}

/** Everything a command needs, as the mounted seat sees it. */
export interface SidebarRightBinding {
  /** The session the mounted seat is drawing. */
  readonly sessionId: SessionId
  /** The seat's store's bound actions; every action names the session it acts on. */
  readonly actions: SurfaceActions
  /**
   * The seat's store surfaces as last committed, keyed by session id; the
   * mounted session's is `surfaces[sessionId]`, absent before the seat's first
   * open. The runtime mints one store per session, so this holds that session.
   */
  readonly surfaces: Readonly<Record<string, SurfaceState>>
  /**
   * The room rule's verdict for a docked pane, as the kit last measured it:
   * whether two working halves would fit. Unmeasured panes fit.
   */
  readonly canSplitPane: (paneId: PaneId) => boolean
}

/** Where an open lands; every field is optional and the defaults are the common case. */
export interface SidebarRightPlacement {
  /** Official surface to open into; inferred from `paneId`/`replaceTab`, otherwise right. */
  readonly surface?: SidebarWorkbenchSurface
  /** Land a new tab in this pane instead of the active docked one. */
  readonly paneId?: PaneId
  /** Take this tab's place — its pane and its strip slot — and close it in the same step. */
  readonly replaceTab?: TabId
  /**
   * Defaults to `true`: a tab already showing the same (kind, contentId) is
   * focused and handed `params`. `false` opens another tab regardless.
   */
  readonly revealIfOpened?: boolean
  /** `false` restores or prepares the occurrence without focusing it or expanding either surface. */
  readonly activate?: boolean
}

/** How a caller wants a resource opened. */
export interface SidebarRightOpenResourceOptions<K extends string = string> extends SidebarRightPlacement {
  /** Name the opening type instead of letting the registry rank claims; its `canOpen` still applies. */
  readonly kind?: K
  /** The resource's navigation parameters, typed by resource type; delivered as `navigation.params`. */
  readonly params?: SidebarRightResourceParams
  /** Persistent viewer state captured with the occurrence. */
  readonly payload?: SidebarRightTabPayloadFor<K>
  /** Optional cross-Session projection owned by this occurrence. */
  readonly pin?: SidebarRightTabPin
}

/** How a caller wants a page type opened. */
export interface SidebarRightOpenTabOptions<K extends string = string> extends SidebarRightPlacement {
  /** That kind's navigation parameters, typed by kind; delivered as `navigation.params`. */
  readonly params?: SidebarRightTabParamsFor<K>
  /** Stable caller-owned identity for a multi-instance page. Omit for a singleton page. */
  readonly instanceId?: string
  /** Persistent kind-owned JSON restored with this occurrence. */
  readonly payload?: SidebarRightTabPayloadFor<K>
  /** Override the definition's initial title for this instance. */
  readonly title?: string
  /** Optional cross-Session projection owned by this occurrence. */
  readonly pin?: SidebarRightTabPin
}

/** Patch accepted by `update`; absent fields stay unchanged. */
export interface SidebarRightUpdateTabOptions<K extends string = string> {
  readonly title?: string
  readonly payload?: SidebarRightTabPayloadFor<K> | undefined
  readonly pin?: SidebarRightTabPin | undefined
}

/** The scheme every resource address carries; anything else is not a resource this face opens. */
const RESOURCE_SCHEME = 'dsh-resource://'

/** Read-only occurrence projection independent of DockKit's internal tree. */
export interface SidebarRightTabProjection {
  readonly sessionId: SessionId
  readonly surface: SidebarWorkbenchSurface
  readonly paneId: PaneId
  readonly floating: boolean
  readonly active: boolean
  /** Whether this record is the visible tab in its pane when its Session is mounted. */
  readonly visible: boolean
  readonly record: TabRecord
  readonly state: SidebarRightTabState
}

/** One materialized Session in the official workbench projection. */
export interface SidebarRightSessionProjection {
  readonly sessionId: SessionId
  readonly rightExpanded: boolean
  readonly bottomExpanded: boolean
  /** Whether this Session has committed its first bottom-surface expansion. */
  readonly bottomOpenedOnce: boolean
  readonly bottomHeight: number
  readonly tabs: readonly SidebarRightTabProjection[]
  readonly data: Readonly<Record<string, JsonValue>>
}

/** Stable public read model, replaced after a materialized Session commits. */
export interface SidebarRightProjection {
  /** Session currently bound to the rendered workbench, if any. */
  readonly mountedSessionId?: SessionId
  readonly sessions: readonly SidebarRightSessionProjection[]
  readonly pinned: readonly SidebarRightTabProjection[]
}

/** Navigation and state operations explicitly aimed at one Session. */
export interface SidebarRightSessionNavigator {
  /**
   * Open a resource in this Session.
   * @param address - a `dsh-resource://<type>/…` address.
   * @param options - routing, placement, navigation, and persistent metadata.
   * @returns the opened or revealed occurrence identity.
   */
  openResource<K extends string = string>(address: string, options?: SidebarRightOpenResourceOptions<K>): Promise<TabId>
  /**
   * Open a page kind in this Session.
   * @param kind - registered page kind.
   * @param options - identity, placement, navigation, and persistent metadata.
   * @returns the opened or revealed occurrence identity.
   */
  openTab<K extends string>(kind: K, options?: SidebarRightOpenTabOptions<K>): Promise<TabId>
  /**
   * Close one occurrence through admission and owner release.
   * @param tabId - occurrence identity.
   * @returns admission, committed closes, and release failures.
   */
  close(tabId: TabId): Promise<SidebarRightCloseOutcome>
  /**
   * Update persistent state on one mounted-Session occurrence.
   * @param tabId - occurrence identity.
   * @param patch - title, JSON payload, or pin changes.
   */
  update<K extends string>(tabId: TabId, patch: SidebarRightUpdateTabOptions<K>): void
  /**
   * Set or delete namespaced Session-level extension data.
   * @param key - non-empty extension-owned namespace key.
   * @param value - durable JSON, or `undefined` to delete the key.
   */
  setData(key: string, value: JsonValue | undefined): void
  /**
   * Close all occurrences and restore fresh surfaces.
   * @returns admission, committed closes, and release failures.
   */
  reset(): Promise<SidebarRightCloseOutcome>
}

function projectLayout(
  sessionId: SessionId,
  surface: SidebarWorkbenchSurface,
  layout: LayoutState,
  state: SurfaceState,
): SidebarRightTabProjection[] {
  return Object.values(layout.tabs).map((record) => {
    const pane = findTabPane(layout, record.id)
    return {
      sessionId,
      surface,
      paneId: pane.id,
      floating: pane.host === 'float',
      active: pane.activeTabId === record.id && layout.activePaneId === pane.id,
      visible: pane.activeTabId === record.id && (pane.host === 'float' || layout.expanded),
      record,
      state: state.tabs[record.id] ?? {},
    }
  })
}

function projectSession(sessionId: SessionId, surface: SurfaceState): SidebarRightSessionProjection {
  return {
    sessionId,
    rightExpanded: surface.layout.expanded,
    bottomExpanded: surface.bottom.layout.expanded,
    bottomOpenedOnce: surface.bottomOpenedOnce,
    bottomHeight: surface.bottomHeight,
    tabs: [
      ...projectLayout(sessionId, 'right', surface.layout, surface),
      ...projectLayout(sessionId, 'bottom', surface.bottom.layout, surface),
    ],
    data: surface.data,
  }
}

/** The outward right-Sidebar face (`ctx.sidebarRight`). */
export interface ISidebarRight {
  /**
   * Open a resource: claim it, place it, reveal the column, record the navigation.
   *
   * Without `options.kind` the registry ranks the types whose globs and
   * `canOpen` accept the address and the best band wins; with it, that kind's
   * type in force opens the address (its `canOpen` still applies). An address
   * outside `dsh-resource://`, or one no type will open, is a wiring mistake,
   * not a user error, so it throws. The column expands in the same step,
   * because content the user cannot see is not opened.
   * @param address - a `dsh-resource://<type>/…` address.
   * @param options - placement, the opening type, and navigation parameters.
   * @returns the opened or revealed occurrence identity.
   */
  openResource<K extends string = string>(address: string, options?: SidebarRightOpenResourceOptions<K>): Promise<TabId>
  /**
   * Open a page type by kind: the type in force for it, at the address this
   * package records pages under. A kind nothing registered throws.
   * @param kind - the page type's kind.
   * @param options - placement and that kind's navigation parameters.
   * @returns the opened or revealed occurrence identity.
   */
  openTab<K extends string>(kind: K, options?: SidebarRightOpenTabOptions<K>): Promise<TabId>
  /**
   * Close one tab of the mounted session.
   * @param tabId - the tab to close.
   * @returns admission, committed closes, and release failures.
   */
  close(tabId: TabId): Promise<SidebarRightCloseOutcome>
  /**
   * Update persistent state on one mounted-Session occurrence.
   * @param tabId - occurrence identity.
   * @param patch - title, JSON payload, or pin changes.
   */
  update<K extends string>(tabId: TabId, patch: SidebarRightUpdateTabOptions<K>): void
  /**
   * Set or delete namespaced Session-level extension data.
   * @param key - non-empty extension-owned namespace key.
   * @param value - durable JSON, or `undefined` to delete the key.
   */
  setData(key: string, value: JsonValue | undefined): void
  /**
   * Address a Session even before the Slot renderer has visited it.
   * @param sessionId - target Session identity.
   * @returns the stable Session-targeted face.
   */
  forSession(sessionId: SessionId): SidebarRightSessionNavigator
  /**
   * Read the stable official workbench projection.
   * @returns the current materialized Sessions and mounted Session identity.
   */
  getSnapshot(): SidebarRightProjection
  /**
   * Subscribe to projection replacement.
   * @param listener - callback invoked after a projection commit.
   * @returns an unsubscribe callback.
   */
  subscribe(listener: () => void): () => void
  /**
   * The active tab of the active pane.
   * @returns the record, or `undefined` when no seat is mounted.
   */
  active(): TabRecord | undefined
  /**
   * Whether the column is currently showing its panel.
   * @returns `true` while expanded; `false` while collapsed to its rail.
   */
  isExpanded(): boolean
  /** Collapse an expanded column, or expand a collapsed one. Recorded in the sequence. */
  toggleExpanded(): void
  /**
   * Focus a tab and the pane holding it, raising a floating one. Recorded.
   * @param tabId - the tab; one that does not exist is left alone.
   */
  focus(tabId: TabId): void
  /**
   * Split a docked pane to its right and seed the new pane, under the same
   * pane budget and room rule as the strip's split control. Recorded when it
   * splits.
   * @param paneId - the pane to split; defaults to the active docked pane.
   * @returns the new pane's id, or `undefined` when nothing was split: the pane
   *   is missing or floating, the budget is spent, or two halves would not fit.
   */
  split(paneId?: PaneId): PaneId | undefined
  /**
   * Take a docked tab out into a floating panel. Recorded.
   * @param tabId - the tab; one that is missing or already floating is left alone.
   * @param rect - the panel's rectangle; defaults to the cascade from the last panel.
   */
  float(tabId: TabId, rect?: FloatRect): void
  /**
   * Return a floating panel's tab to the active docked pane. Recorded.
   * @param paneId - the floating pane; one that is missing or docked is left alone.
   */
  dock(paneId: PaneId): void
}

/** Cross-plugin right-Sidebar face (ctx.sidebarRight). */
export class SidebarRightController implements ISidebarRight {
  private binding: SidebarRightBinding | undefined
  private materialize: ((sessionId: SessionId) => SidebarRightSurfaceStore) | undefined
  private readonly closeQueues = new Map<SessionId, SidebarRightCloseCoordinator>()
  private readonly projectionListeners = new Set<() => void>()
  private projection: SidebarRightProjection = { sessions: [], pinned: [] }
  private readonly sessionProjections = new Map<SessionId, SidebarRightSessionProjection>()

  /**
   * The Tab domain this controller navigates into; synced from each adopted
   * store's commits, read by the seat for each body's owner share.
   */
  readonly tabDomain: TabDomain

  /**
   * @param tabs - the tab-type registry consulted to claim an address.
   * @param pin - `ctx.resources.pin`, which the Tab domain holds addresses with.
   * @param adopted - plugin-owned session stores used by occurrence actions.
   */
  constructor(
    private readonly tabs: SidebarRightTabRegistry,
    pin: PinResource,
    private readonly adopted = new Map<SessionId, Adoption>(),
  ) {
    this.tabDomain = new TabDomain(this, pin)
  }

  /**
   * Install the shared store handle's Session materializer.
   * @param factory - returns the scoped store instance for a target Session.
   */
  installMaterializer(factory: (sessionId: SessionId) => SidebarRightSurfaceStore): void {
    if (this.materialize !== undefined) throw new Error('sidebarRight: Session materializer is already installed')
    this.materialize = factory
  }

  /**
   * Reconcile occurrence lifetime and public projection from one atomic store snapshot.
   * @param sessionId - Session whose state committed.
   * @param surface - complete committed workbench state.
   */
  syncSession(sessionId: SessionId, surface: SurfaceState): void {
    this.tabDomain.sync(sessionId, [surface.layout, surface.bottom.layout])
    this.sessionProjections.set(sessionId, projectSession(sessionId, surface))
    this.publishProjection()
  }

  private publishProjection(): void {
    const sessions = [...this.sessionProjections.values()]
    this.projection = {
      ...this.binding === undefined ? {} : { mountedSessionId: this.binding.sessionId },
      sessions,
      pinned: sessions.flatMap(session => session.tabs.filter(tab => tab.state.pin !== undefined)),
    }
    notifySubscribers(this.projectionListeners, '[sidebarRight]')
  }

  /**
   * Adopt the mounted seat's binding, replacing any previous one.
   *
   * Called from the seat while it is mounted, and released when it leaves.
   * @param binding - the mounted seat's session, actions, and the store's surfaces.
   * @returns a release callback that clears exactly this binding.
   */
  bind(binding: SidebarRightBinding): () => void {
    this.binding = binding
    this.publishProjection()
    return () => {
      // A newer seat may already have taken over; only the binding that is
      // still ours may be cleared.
      if (this.binding === binding) {
        this.binding = undefined
        this.publishProjection()
      }
    }
  }

  /**
   * Open a resource: claim it, place it, reveal the column, record the navigation.
   * @param address - a `dsh-resource://<type>/…` address.
   * @param options - placement, the opening type, and navigation parameters.
   * @returns the opened or revealed occurrence identity.
   */
  openResource<K extends string = string>(address: string, options: SidebarRightOpenResourceOptions<K> = {}): Promise<TabId> {
    const { sessionId, actions } = this.require()
    return this.placeResource(sessionId, actions, address, options)
  }

  /**
   * Open a page type by kind at the address this package records pages under.
   * @param kind - the page type's kind.
   * @param options - placement and that kind's navigation parameters.
   * @returns the opened or revealed occurrence identity.
   */
  openTab<K extends string>(kind: K, options: SidebarRightOpenTabOptions<K> = {}): Promise<TabId> {
    const { sessionId, actions } = this.require()
    return this.placeTab(sessionId, actions, kind, options)
  }

  /**
   * Open a resource in one Session for a tab's own action, materializing its
   * store when the renderer has not visited it.
   * Not part of `ISidebarRight`: the Tab domain's path.
   * @param sessionId - the session the acting tab is in.
   * @param address - a `dsh-resource://<type>/…` address.
   * @param options - placement, the opening type, and navigation parameters.
   * @returns the opened or revealed occurrence identity.
   */
  openResourceIn<K extends string = string>(
    sessionId: SessionId,
    address: string,
    options: SidebarRightOpenResourceOptions<K> = {},
  ): Promise<TabId> {
    return this.placeResource(sessionId, this.actionsFor(sessionId), address, options)
  }

  /**
   * Open a page type in one Session for a tab's own action, materializing its
   * store when the renderer has not visited it.
   * Not part of `ISidebarRight`: the Tab domain's path.
   * @param sessionId - the session the acting tab is in.
   * @param kind - the page type's kind.
   * @param options - placement and that kind's navigation parameters.
   * @returns the opened or revealed occurrence identity.
   */
  openTabIn<K extends string>(sessionId: SessionId, kind: K, options: SidebarRightOpenTabOptions<K> = {}): Promise<TabId> {
    return this.placeTab(sessionId, this.actionsFor(sessionId), kind, options)
  }

  /**
   * Close a tab of one Session for the tab's own action, materializing its
   * store when the renderer has not visited it.
   * Not part of `ISidebarRight`: the Tab domain's path.
   * @param sessionId - the session the tab is in.
   * @param tabId - the tab to close.
   * @returns admission, committed closes, and release failures.
   */
  closeIn(sessionId: SessionId, tabId: TabId): Promise<SidebarRightCloseOutcome> {
    return this.closeTabsIn(sessionId, [tabId])
  }

  /**
   * Close one tab-menu batch in its Session through one admission and release transaction.
   * Not part of `ISidebarRight`: the workbench seat's menu path.
   * @param sessionId - the session whose pane supplied the menu.
   * @param tabIds - current occurrence identities selected by the pane-relative action.
   * @returns admission, committed closes, and release failures.
   */
  closeTabsIn(sessionId: SessionId, tabIds: readonly TabId[]): Promise<SidebarRightCloseOutcome> {
    return this.closeMany(sessionId, tabIds, 'close')
  }

  /** Claim a resource and place it in one session; an address outside the scheme or one no type claims throws. */
  private placeResource(
    sessionId: SessionId,
    actions: SurfaceActions,
    address: string,
    options: SidebarRightOpenResourceOptions,
  ): Promise<TabId> {
    if (!address.startsWith(RESOURCE_SCHEME)) {
      throw new Error(`sidebarRight: no registered tab type claims "${address}"`)
    }
    const claim = this.tabs.claim(address, options.kind)
    return this.place(sessionId, actions, claim, address, options, options.params, options.payload, options.pin)
  }

  /** Place a page type in one session at the address pages are recorded under; an unregistered kind throws. */
  private placeTab<K extends string>(
    sessionId: SessionId,
    actions: SurfaceActions,
    kind: K,
    options: SidebarRightOpenTabOptions<K>,
  ): Promise<TabId> {
    const definition = this.tabs.get(kind)
    if (definition === undefined) throw new Error(`sidebarRight: no tab type is registered as "${kind}"`)
    if (!this.tabs.isTabEnabled(definition.id)) throw new Error(`sidebarRight: tab type "${kind}" is disabled`)
    const address = options.instanceId === undefined ? pageAddress(kind) : pageInstanceAddress(kind, options.instanceId)
    return this.place(
      sessionId,
      actions,
      { kind, contentId: address, title: options.title ?? definition.title(address) },
      address,
      options,
      options.params,
      options.payload,
      options.pin,
    )
  }

  /** The steps both opens share: one store intent, and the navigation record for the tab it settles on. */
  private async place(
    sessionId: SessionId,
    actions: SurfaceActions,
    claim: SidebarRightTabClaim,
    address: string,
    placement: SidebarRightPlacement,
    params: SidebarRightNavigationParams,
    payload: SidebarRightTabPayload | undefined,
    pin: SidebarRightTabPin | undefined,
  ): Promise<TabId> {
    if (placement.activate === false && placement.replaceTab !== undefined) {
      throw new Error('sidebarRight: an inactive open cannot replace a tab')
    }
    const definition = this.tabs.get(claim.kind)
    if (definition === undefined) throw new Error(`sidebarRight: no tab type is registered as "${claim.kind}"`)
    let settledClaim = claim
    let settledPayload = payload
    const descriptorContext = this.descriptorContext(sessionId)
    if (definition.create !== undefined) {
      const created = definition.create({
        ...descriptorContext,
        kind: claim.kind,
        address,
        title: claim.title,
        params,
        payload,
        pin,
      })
      if (created === false) throw new Error(`sidebarRight: tab type "${claim.kind}" refused creation`)
      settledClaim = {
        kind: claim.kind,
        contentId: created.contentId ?? claim.contentId,
        title: created.title ?? claim.title,
      }
      if (Object.hasOwn(created, 'payload')) settledPayload = created.payload
    }
    if (settledClaim.contentId.length === 0) {
      throw new Error(`sidebarRight: tab type "${claim.kind}" created an empty content id`)
    }
    let paneId = placement.paneId
    let index: number | undefined
    const replacement = { checkpoint: false }
    if (placement.replaceTab !== undefined) {
      const existing = this.surfaceFor(sessionId)
      const found = existing === undefined ? undefined : locateTab(existing, placement.replaceTab)
      if (found !== undefined && existing !== undefined) {
        const pane = findTabPane(
          found.surface === 'right' ? existing.layout : existing.bottom.layout,
          placement.replaceTab,
        )
        if (pane.host === 'dock' && (placement.surface === undefined || placement.surface === found.surface)) {
          paneId = pane.id
          index = pane.tabs.indexOf(placement.replaceTab)
        }
        const outcome = await this.closeMany(sessionId, [placement.replaceTab], 'replace', (_closed, checkpoint) => {
          replacement.checkpoint = checkpoint
        })
        if (!outcome.closed.includes(placement.replaceTab)) {
          throw new Error(`sidebarRight: replacement tab "${placement.replaceTab}" could not close`)
        }
      }
    }
    const duplicate = this.descriptorDuplicate(sessionId, definition, settledClaim, settledPayload, pin, placement.surface)
    if (duplicate !== undefined) {
      if (placement.activate !== false) {
        actions.focusTab(sessionId, duplicate.id as TabId)
        if (address.startsWith(RESOURCE_SCHEME) && !duplicate.floating) {
          actions.setSurfaceExpanded(sessionId, duplicate.surface, true)
        }
      }
      this.tabDomain.navigate(sessionId, duplicate.id as TabId, { address, params })
      if (placement.activate !== false) {
        this.invokeDescriptorLifecycle(sessionId, 'onActivate', definition, duplicate)
      }
      return duplicate.id as TabId
    }
    const payloadSnapshot = settledPayload === undefined
      ? undefined
      : snapshotJsonValue(settledPayload)
    if (settledPayload !== undefined && payloadSnapshot === undefined) {
      throw new Error(`sidebarRight: tab kind "${settledClaim.kind}" carries a non-JSON payload`)
    }
    const before = new Set(descriptorContext.tabs.map(tab => tab.id))
    let settled: TabId | undefined
    actions.openContent(sessionId, {
      kind: settledClaim.kind,
      contentId: settledClaim.contentId,
      title: settledClaim.title,
      ...placement.surface === undefined ? {} : { surface: placement.surface },
      ...paneId === undefined ? {} : { paneId },
      ...index === undefined ? {} : { index },
      ...placement.replaceTab === undefined ? {} : { replaceTab: placement.replaceTab },
      ...placement.revealIfOpened === undefined ? {} : { revealIfOpened: placement.revealIfOpened },
      ...placement.activate === undefined ? {} : { activate: placement.activate },
      ...payloadSnapshot === undefined ? {} : { payload: payloadSnapshot },
      ...pin === undefined ? {} : { pin },
      checkpoint: replacement.checkpoint || definition.beforeClose !== undefined || definition.close !== undefined,
    }, (tabId) => {
      settled = tabId
      this.tabDomain.navigate(sessionId, tabId, { address, params })
    })
    if (settled === undefined) throw new Error(`sidebarRight: open of "${address}" did not settle`)
    const actual = this.descriptorContext(sessionId).tabs.find(tab => tab.id === settled)
    if (actual !== undefined) {
      if (!before.has(settled)) this.invokeDescriptorLifecycle(sessionId, 'onOpen', definition, actual)
      else if (placement.activate !== false) this.invokeDescriptorLifecycle(sessionId, 'onActivate', definition, actual)
    }
    return settled
  }

  /** Pure descriptor view over one Session's official projection. */
  private descriptorContext(sessionId: SessionId): SidebarRightDescriptorContext {
    const session = this.sessionProjections.get(sessionId)
    return {
      sessionId,
      preferences: this.tabs.preferences(),
      tabs: session?.tabs.map(tab => ({
        id: tab.record.id,
        kind: tab.record.kind,
        contentId: tab.record.contentId,
        title: tab.record.title,
        surface: tab.surface,
        floating: tab.floating,
        payload: tab.state.payload,
        pin: tab.state.pin,
      })) ?? [],
    }
  }

  /** Existing occurrence selected by a definition's explicit instance rule. */
  private descriptorDuplicate(
    sessionId: SessionId,
    definition: SidebarRightTabDefinition,
    claim: SidebarRightTabClaim,
    payload: SidebarRightTabPayload | undefined,
    pin: SidebarRightTabPin | undefined,
    surface: SidebarWorkbenchSurface | undefined,
  ): SidebarRightDescriptorTab | undefined {
    const keyOf = definition.dedupeKey ?? (definition.single === true ? () => definition.id : undefined)
    if (keyOf === undefined) return undefined
    const context = this.descriptorContext(sessionId)
    const requested: SidebarRightDescriptorTab = {
      id: '',
      kind: claim.kind,
      contentId: claim.contentId,
      title: claim.title,
      surface: surface ?? 'right',
      floating: false,
      payload,
      pin,
    }
    const key = keyOf(requested)
    if (key === undefined) return undefined
    return context.tabs.find(tab => tab.kind === definition.kind && keyOf(tab) === key)
  }

  /** Run a non-admitting descriptor notification without breaking the completed state action. */
  private invokeDescriptorLifecycle(
    sessionId: SessionId,
    name: 'onOpen' | 'onActivate',
    definition: SidebarRightTabDefinition,
    tab: SidebarRightDescriptorTab,
  ): void {
    const callback = definition[name]
    if (callback === undefined) return
    try {
      callback(tab, this.descriptorContext(sessionId))
    } catch (error) {
      console.error(`sidebarRight: ${name} failed for "${definition.id}"`, error)
    }
  }

  /**
   * Close one tab of the mounted session.
   * @param tabId - the tab to close.
   */
  close(tabId: TabId): Promise<SidebarRightCloseOutcome> {
    const { sessionId } = this.require()
    return this.closeIn(sessionId, tabId)
  }

  /** Target one Session, materializing its official store on first use. */
  forSession(sessionId: SessionId): SidebarRightSessionNavigator {
    this.actionsFor(sessionId)
    return {
      openResource: (address, options = {}) => this.openResourceIn(sessionId, address, options),
      openTab: (kind, options = {}) => this.openTabIn(sessionId, kind, options),
      close: tabId => this.closeIn(sessionId, tabId),
      update: (tabId, patch) => { this.updateIn(sessionId, tabId, patch) },
      setData: (key, value) => { this.setDataIn(sessionId, key, value) },
      reset: () => this.resetIn(sessionId),
    }
  }

  /** Current stable official workbench projection. */
  getSnapshot(): SidebarRightProjection {
    return this.projection
  }

  /** Subscribe to official workbench projection replacement. */
  subscribe(listener: () => void): () => void {
    this.projectionListeners.add(listener)
    return () => { this.projectionListeners.delete(listener) }
  }

  /** Update one occurrence without changing its identity or navigation revision. */
  update<K extends string>(tabId: TabId, patch: SidebarRightUpdateTabOptions<K>): void {
    const { sessionId } = this.require()
    this.updateIn(sessionId, tabId, patch)
  }

  /**
   * Update one occurrence in an explicitly targeted Session.
   * @param sessionId - target Session.
   * @param tabId - occurrence identity.
   * @param patch - persistent fields to replace or remove.
   */
  updateIn<K extends string>(sessionId: SessionId, tabId: TabId, patch: SidebarRightUpdateTabOptions<K>): void {
    const next: UpdateTabIntent = { ...patch }
    if (Object.hasOwn(patch, 'payload') && patch.payload !== undefined) {
      const payload = snapshotJsonValue(patch.payload)
      if (payload === undefined) throw new Error('sidebarRight: tab update carries a non-JSON payload')
      ;(next as { payload?: SidebarRightTabPayload }).payload = payload
    }
    this.actionsFor(sessionId).updateTab(sessionId, tabId, next)
  }

  /**
   * Set or delete namespaced extension data in an explicitly targeted Session.
   * @param sessionId - target Session.
   * @param key - non-empty extension-owned namespace key.
   * @param value - durable JSON, or `undefined` to delete the key.
   */
  setDataIn(sessionId: SessionId, key: string, value: JsonValue | undefined): void {
    if (key.length === 0) throw new Error('sidebarRight: extension data key must not be empty')
    const snapshot = value === undefined ? undefined : snapshotJsonValue(value)
    if (value !== undefined && snapshot === undefined) throw new Error('sidebarRight: extension data is not JSON')
    this.actionsFor(sessionId).updateData(sessionId, key, snapshot)
  }

  /** Set or delete namespaced extension data in the mounted Session. */
  setData(key: string, value: JsonValue | undefined): void {
    this.setDataIn(this.require().sessionId, key, value)
  }

  /**
   * Close every current record and restore a fresh official workbench.
   * @param sessionId - target Session.
   * @returns admission, committed closes, and release failures.
   */
  async resetIn(sessionId: SessionId): Promise<SidebarRightCloseOutcome> {
    const before = this.surfaceFor(sessionId)
    const ids = before === undefined ? [] : workbenchTabs(before).map(tab => tab.id)
    const outcome = await this.closeMany(sessionId, ids, 'reset')
    if (outcome.admitted && outcome.failed.length === 0) this.actionsFor(sessionId).reset(sessionId)
    return outcome
  }

  private closeMany(
    sessionId: SessionId,
    tabIds: readonly TabId[],
    reason: SidebarRightCloseReason,
    commit?: (closed: readonly TabId[], checkpoint: boolean) => void,
  ): Promise<SidebarRightCloseOutcome> {
    const actions = this.actionsFor(sessionId)
    let queue = this.closeQueues.get(sessionId)
    if (queue === undefined) {
      queue = new SidebarRightCloseCoordinator()
      this.closeQueues.set(sessionId, queue)
    }
    return queue.run(
      () => this.closeCandidates(sessionId, tabIds, reason),
      commit ?? ((closed, checkpoint) => { actions.closeTabs(sessionId, closed, checkpoint) }),
    )
  }

  private closeCandidates(
    sessionId: SessionId,
    tabIds: readonly TabId[],
    reason: SidebarRightCloseReason,
  ) {
    const surface = this.surfaceFor(sessionId)
    if (surface === undefined) return []
    return tabIds.flatMap((id) => {
      const found = locateTab(surface, id)
      if (found === undefined) return []
      const occurrence = this.tabDomain.occurrence(sessionId, found.record)
      const context: SidebarRightTabCloseContext = {
        sessionId,
        surface: found.surface,
        tab: found.record,
        payload: surface.tabs[id]?.payload,
        pin: surface.tabs[id]?.pin,
        signal: occurrence.signal,
        reason,
      }
      return [{ context, definition: this.tabs.get(found.record.kind) }]
    })
  }

  /**
   * The active tab of the active pane.
   * @returns the record, or `undefined` with no mounted surface.
   */
  active(): TabRecord | undefined {
    const layout = this.mounted()?.layout
    if (layout === undefined) return undefined
    const { activeTabId } = getPane(layout, layout.activePaneId)
    return Object.values(layout.tabs).find(tab => tab.id === activeTabId)
  }

  /**
   * Whether the column is currently showing its panel.
   * @returns `true` while expanded; `false` while collapsed or with no mounted surface.
   */
  isExpanded(): boolean {
    return this.mounted()?.layout.expanded ?? false
  }

  /** Collapse an expanded column, or expand a collapsed one. */
  toggleExpanded(): void {
    const { sessionId, actions } = this.require()
    actions.toggleExpanded(sessionId)
  }

  /**
   * Focus a tab and the pane holding it; a missing tab is left alone.
   * @param tabId - the tab to focus.
   */
  focus(tabId: TabId): void {
    const { sessionId, actions } = this.require()
    const current = this.descriptorContext(sessionId).tabs.find(tab => tab.id === tabId)
    if (current === undefined) return
    actions.focusTab(sessionId, tabId)
    const actual = this.descriptorContext(sessionId).tabs.find(tab => tab.id === tabId) ?? current
    const definition = this.tabs.get(actual.kind)
    if (definition !== undefined) this.invokeDescriptorLifecycle(sessionId, 'onActivate', definition, actual)
  }

  /**
   * Split a docked pane to its right when the budget and the room rule allow.
   * @param paneId - the pane to split; defaults to the active docked pane.
   * @returns the new pane's id, or `undefined` when nothing was split.
   */
  split(paneId?: PaneId): PaneId | undefined {
    const { sessionId, actions, canSplitPane } = this.require()
    const layout = this.mounted()?.layout
    if (layout === undefined) return undefined
    const target = paneId ?? activeDockPaneId(layout)
    const node = layout.nodes[target]
    if (node === undefined || node.kind !== 'pane' || node.host !== 'dock') return undefined
    if (!canSplit(layout) || dockPaneIds(layout).length >= 2 || !canSplitPane(target)) return undefined
    let created: PaneId | undefined
    actions.splitPane(sessionId, target, (id) => { created = id })
    return created
  }

  /**
   * Take a docked tab out into a floating panel; a missing or floating tab is left alone.
   * @param tabId - the tab to float.
   * @param rect - the panel's rectangle; defaults to the cascade from the last panel.
   */
  float(tabId: TabId, rect?: FloatRect): void {
    const { sessionId, actions } = this.require()
    const layout = this.mounted()?.layout
    if (layout === undefined || layout.tabs[tabId] === undefined) return
    if (findTabPane(layout, tabId).host !== 'dock') return
    actions.floatTab(sessionId, tabId, rect)
  }

  /**
   * Return a floating panel's tab to the active docked pane; a missing or docked pane is left alone.
   * @param paneId - the floating pane.
   */
  dock(paneId: PaneId): void {
    const { sessionId, actions } = this.require()
    const node = this.mounted()?.layout.nodes[paneId]
    if (node === undefined || node.kind !== 'pane' || node.host !== 'float') return
    actions.unfloatPane(sessionId, paneId)
  }

  /**
   * Step the mounted session's surface back one intent.
   *
   * @internal Not part of the product: the sequence is an architectural fact
   * with no user-facing control yet. Kept reachable for tests.
   * @param surface - workbench surface to step; defaults to right.
   * @returns admission and any occurrence-release failures.
   */
  _undo(surface: SidebarWorkbenchSurface = 'right'): Promise<SidebarRightCloseOutcome> {
    return this.stepHistory(this.require().sessionId, surface, 'undo', stepBack)
  }

  /**
   * Step the mounted session's surface forward one intent.
   *
   * @internal See `_undo`.
   * @param surface - workbench surface to step; defaults to right.
   * @returns admission and any occurrence-release failures.
   */
  _redo(surface: SidebarWorkbenchSurface = 'right'): Promise<SidebarRightCloseOutcome> {
    return this.stepHistory(this.require().sessionId, surface, 'redo', stepForward)
  }

  private stepHistory(
    sessionId: SessionId,
    target: SidebarWorkbenchSurface,
    reason: 'undo' | 'redo',
    step: typeof stepBack,
  ): Promise<SidebarRightCloseOutcome> {
    const actions = this.actionsFor(sessionId)
    const currentSurface = this.surfaceFor(sessionId)
    const current = currentSurface === undefined
      ? undefined
      : target === 'right'
        ? { layout: currentSurface.layout, history: currentSurface.history }
        : currentSurface.bottom
    const preview = current === undefined ? undefined : step(current.history, current.layout)
    if (current === undefined || preview === undefined) {
      return Promise.resolve({ admitted: true, closed: [], failed: [] })
    }
    const removed = Object.values(current.layout.tabs)
      .filter(tab => preview.state.tabs[tab.id] === undefined)
      .map(tab => tab.id)
    if (removed.length === 0) {
      actions.replaceDock(sessionId, target, { layout: preview.state, history: preview.history })
      return Promise.resolve({ admitted: true, closed: [], failed: [] })
    }
    let planned = { ...preview, removed }
    let queue = this.closeQueues.get(sessionId)
    if (queue === undefined) {
      queue = new SidebarRightCloseCoordinator()
      this.closeQueues.set(sessionId, queue)
    }
    return queue.run(() => {
      const surface = this.surfaceFor(sessionId)
      const live = surface === undefined ? undefined : target === 'right'
        ? { layout: surface.layout, history: surface.history }
        : surface.bottom
      const moved = live === undefined ? undefined : step(live.history, live.layout)
      if (live === undefined || moved === undefined) {
        planned = { state: live?.layout ?? preview.state, history: live?.history ?? preview.history, removed: [] }
        return []
      }
      const ids = Object.values(live.layout.tabs)
        .filter(tab => moved.state.tabs[tab.id] === undefined)
        .map(tab => tab.id)
      planned = { ...moved, removed: ids }
      return this.closeCandidates(sessionId, ids, reason)
    }, (closed) => {
      if (closed.length === planned.removed.length) {
        actions.replaceDock(sessionId, target, { layout: planned.state, history: planned.history })
      } else if (closed.length > 0) {
        actions.closeTabs(sessionId, closed, true)
      }
    })
  }

  /** The mounted session's surface; `undefined` without a seat or before its first open. */
  private mounted(): SurfaceState | undefined {
    const { binding } = this
    return binding === undefined ? undefined : binding.surfaces[binding.sessionId]
  }

  /**
   * The store actions a tab's own action on `sessionId` runs through: that
   * session's adopted store. `undefined` — nothing to act on — for a session
   * whose store was never minted or whose adoption was released.
   */
  private actionsFor(sessionId: SessionId): SurfaceActions {
    let adoption = this.adopted.get(sessionId)
    if (adoption === undefined) {
      this.materialize?.(sessionId)
      adoption = this.adopted.get(sessionId)
    }
    if (adoption === undefined) throw new Error(`sidebarRight: session "${sessionId}" cannot be materialized`)
    return adoption.store.actions
  }

  private surfaceFor(sessionId: SessionId): SurfaceState | undefined {
    const adoption = this.adopted.get(sessionId)
    return adoption?.store.getSnapshot().bySession[sessionId]
  }

  private require(): SidebarRightBinding {
    // Reads answer for the no-session case (there is nothing expanded), but a
    // write has no session to write to. Callers are UI gestures and tool
    // results, both of which belong to a session that is on screen.
    if (this.binding === undefined) {
      throw new Error('sidebarRight: no session surface is mounted')
    }
    return this.binding
  }
}
