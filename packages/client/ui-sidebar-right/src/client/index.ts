/**
 * Browser half: fill the frame's right column with the panel, put the expand
 * button in the conversation header, and own the seats a tab type registers
 * into.
 *
 * Two seats share one session-scoped store, which the slot runtime allows
 * because both are session-scoped (a handle may not span scopes). The panel seat
 * in the frame draws the surface normally or fullscreen, retaining the track
 * on wide viewports; the header's corner seat draws the way back in
 * while the panel is hidden. The store is the layout's only source of truth; the docking
 * kit's pure planners compute every change and the store records them, one
 * history entry per intent.
 *
 * The frame is a base package and never injects this one. What it needs —
 * whether the panel is shown and whether it wants a track — arrives through its
 * own `ctx.layout` action face, reported by the seat that knows both facts.
 *
 * Tab types register in two stages: the type itself into `ctx.sidebarRightTabs`,
 * its body into the keyed `sidebar.right.pane.tab` seat under the same kind. The
 * guide registers through those stages unmodified, exactly as a type shipped
 * from another package does — `ui-sidebar-documentpreview` is the live proof.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from './contract/slots.ts'
import { GuideBody, type GuideInjected } from './tabs/guide/GuideBody.tsx'
import { GuideTitle } from './tabs/guide/GuideTitle.tsx'
import { ExpandButton } from './shell/ExpandButton.tsx'
import { NARROW_WORKBENCH_WIDTH, WorkbenchSeat, type SidebarRightInjected } from './shell/SidebarRight.tsx'
import { createSidebarRightController, type SidebarRightController } from './service.ts'
import { SidebarRightTabRegistry } from './tab-registry.ts'
import {
  parseSidebarRightPreferences,
  SIDEBAR_RIGHT_PREFERENCES_NAMESPACE,
  SidebarRightPreferencesController,
} from './preferences.ts'
import { createSidebarRightStore } from './stores.ts'
import { defaultSeed } from './contract/seed.ts'
import { createLocalSidebarWorkbenchPersistence } from './persistence.ts'
import { en, zh } from './locales.ts'
import { GUIDE_ID, guideDefinition } from './tabs/guide/definition.ts'
import { guideTabInfoFactory, tabInfoFactory } from './tab-info.ts'

export type {
  SidebarBottomPresentation, SidebarRightInjected, SidebarRightPresentation, WorkbenchSeatProps,
} from './shell/SidebarRight.tsx'
export type { GuideBodyProps, GuideInjected } from './tabs/guide/GuideBody.tsx'
export type { ExpandButtonProps } from './shell/ExpandButton.tsx'
export type {
  DockSurfaceState, LocatedTab, SidebarRightActions, SidebarRightState, SidebarWorkbenchSurface,
  SurfaceState, UpdateTabIntent,
} from './stores.ts'
export type {
  ISidebarRight, SidebarRightBinding, SidebarRightOpenResourceOptions, SidebarRightOpenTabOptions,
  SidebarRightPlacement, SidebarRightProjection, SidebarRightSessionNavigator, SidebarRightSessionProjection,
  SidebarRightTabProjection, SidebarRightUpdateTabOptions, SurfaceActions,
} from './service.ts'
export type {
  SidebarRightGuideBox, SidebarRightGuideEntry, SidebarRightTabClaim, SidebarRightTabDefinition,
  SidebarRightTabCloseContext, SidebarRightCloseReason, SidebarRightDescriptorContext,
  SidebarRightDescriptorIcon, SidebarRightDescriptorTab, SidebarRightSettingControl,
  SidebarRightSettingDefinition, SidebarRightSettingOption, SidebarRightSettingsDeclaration,
  SidebarRightTabCreateRequest, SidebarRightTabCreateResult, SidebarRightTabPriority,
  SidebarRightViewerDefinition, SidebarRightViewerDetectRequest, SidebarRightViewerFetchStrategy,
  SidebarRightViewerLoadRequest, SidebarRightViewerMatchRequest,
} from './tab-registry.ts'
export type {
  SidebarRightHtmlViewerSafety, SidebarRightPreferences, SidebarRightPreferencesReader,
  SidebarRightPreferencesSnapshot, SidebarRightTitleBarScheme,
} from './preferences.ts'
export type {
  SidebarRightTabPayload, SidebarRightTabPayloadFor, SidebarRightTabPayloadMap, SidebarRightTabPin,
  SidebarRightTabState,
} from './contract/payload.ts'
export type { SidebarRightCloseFailure, SidebarRightCloseOutcome } from './close-coordinator.ts'
export type {
  SidebarRightTabInfo, SidebarRightTabInjected, UseSidebarRightTabInfo, SidebarRightTabActions,
  SidebarRightDescriptorIconOwnerProps, SidebarRightDescriptorSettingsOwnerProps,
  SidebarRightTabMenuOwnerProps, SidebarRightTabNavigation, SidebarRightTabPlacement,
} from './contract/slots.ts'
export type {
  SidebarRightNavigationParams, SidebarRightResourceParams, SidebarRightResourceParamsMap,
  SidebarRightTabParams, SidebarRightTabParamsFor, SidebarRightTabParamsMap,
} from './contract/params.ts'
// The layout ids and rectangle the navigation face takes, so a caller needs no import from the kit.
export type { FloatRect, PaneId, TabId, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
export type { PinResource, SidebarRightNavigator, TabOccurrence } from './tab-domain.ts'
export type { SidebarRightKey } from './locales.ts'
export type { OpenContentIntent } from './stores.ts'
export type { SidebarWorkbenchPersistence, SidebarWorkbenchStorage } from './persistence.ts'

/** This package's copy namespace. */
const NS = 'sidebarRight'

/** Required browser services: the slot registry, the frame's panel actions, copy, and the resource model. */
export const inject = ['slots', 'layout', 'locale', 'resources', 'settingsScope']

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Right-Sidebar navigation and presentation face. */
    sidebarRight: SidebarRightController
    /** Right-Sidebar tab-type registry (stage one of a tab type's registration). */
    sidebarRightTabs: SidebarRightTabRegistry
    /** Sole browser owner of the global Sidebar preference document. */
    sidebarRightPreferences: SidebarRightPreferencesController
  }
}

/**
 * Client plugin body: provide the registry and the navigation face, register the
 * panel seat and the rail seat over one store with their extension children, and
 * register the guide type through the same public two-stage path any other type
 * uses.
 * @param ctx - client root context carrying the slot registry, the frame's face, and copy.
 */
export function apply(ctx: ClientContext): void {
  // The registry and the face it backs are built here, at apply's top level,
  // and never inside an effect. A registry other packages register into cannot
  // have an effect-internal scope as its host: `register()` adds an effect to
  // this fiber, and doing that from another plugin's apply while the effect is
  // still the active scope stalls browser boot with no error at all. The
  // template this follows (ui-conversation's definition registry) is built at
  // its own apply top level for the same reason.
  const t = ctx.locale.bind(NS)
  const preferenceScope = ctx.settingsScope.bind({
    namespace: SIDEBAR_RIGHT_PREFERENCES_NAMESPACE,
    decode: parseSidebarRightPreferences,
  })
  const preferences = new SidebarRightPreferencesController(preferenceScope)
  ctx.effect(() => preferences.connect(), 'ui-sidebar-right: global preferences')
  const tabs = new SidebarRightTabRegistry(ctx, preferences)
  const { controller, adopt, materializeWith } = createSidebarRightController(
    tabs,
    (address, signal) => { ctx.resources.pin(address, signal) },
  )
  const disposeRegistry = ctx.reflect.provide('sidebarRightTabs', tabs)
  const disposePreferences = ctx.reflect.provide('sidebarRightPreferences', preferences)
  const disposeService = ctx.reflect.provide('sidebarRight', controller)
  // Registered first, so it tears down last: the faces outlive every seat and
  // type that reaches for them. provide()'s disposer settles asynchronously;
  // teardown is synchronous fire-and-forget, matching ui-layout's root entry.
  // Unloading aborts every tab occurrence, which releases every pin.
  ctx.effect(() => () => {
    controller.tabDomain.dispose()
    void disposeService()
    void disposePreferences()
    void disposeRegistry()
  }, 'ui-sidebar-right: service faces')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-right: dictionaries')

  ctx.effect(() => {
    const adoptions = new Map<SessionId, () => void>()
    const store = createSidebarRightStore(
      () => defaultSeed(tabs),
      createLocalSidebarWorkbenchPersistence(),
      (scopeKey, instance) => {
        const sessionId = scopeKey as SessionId
        adoptions.get(sessionId)?.()
        adoptions.set(sessionId, adopt(sessionId, instance))
      },
      () => preferences.getSnapshot().preferences.openByDefault
        && (typeof window === 'undefined' || window.innerWidth >= NARROW_WORKBENCH_WIDTH),
    )
    materializeWith(sessionId => store.create(sessionId))
    const layout: ILayout = ctx.layout
    const injected: Omit<SidebarRightInjected, 'occurrence'> = {
      syncPresentation({ shown, track, fullscreen }) {
        if (shown) layout.openRightbar(track, fullscreen)
        else layout.closeRightbar()
      },
      syncBottomPresentation({ shown, height, fullscreen }) {
        if (shown) layout.openBottombar(height, fullscreen)
        else layout.closeBottombar()
      },
      bindService: binding => controller.bind(binding),
      openTab: (kind, options) => { void controller.openTab(kind, options) },
      activateTab: (tabId) => { controller.focus(tabId) },
      closeTab: (tabId) => { void controller.close(tabId) },
      closeTabs: (sessionId, tabIds) => { void controller.closeTabsIn(sessionId, tabIds) },
      hooks: {
        tabTypes: { subscribe: listener => tabs.subscribe(listener), getSnapshot: () => tabs.entries() },
        preferences: preferences,
        workbench: controller,
      },
    }

    const disposeTypes = [tabs.register(guideDefinition(t))]
    const disposeSeat = ctx.slots.inject('workbench', () => ctx.slots.register({
      name: 'workbench',
      locale: NS,
      children: {
        'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
        'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
        'sidebar.right.tab.menu.item': { kind: 'list', scope: 'session' },
        'sidebar.right.tab.icon': { kind: 'keyed', scope: 'session' },
        'sidebar.right.viewer.icon': { kind: 'keyed', scope: 'session' },
      },
      store,
      inject: (_sessionId): SidebarRightInjected => ({
        ...injected,
        occurrence: (homeSessionId, tab) => controller.tabDomain.occurrence(homeSessionId, tab),
      }),
    }, WorkbenchSeat))
    // The expand button shares the panel's store: it only needs to know whether
    // the panel is expanded, and to ask for it to be. The header's corner seat
    // is its own place, past the utilities, so showing and hiding it moves
    // nothing else in the row.
    const disposeExpand = ctx.slots.inject('conversation.session.header.corner', () => ctx.slots.register({
      name: 'conversation.session.header.corner',
      locale: NS,
      store,
    }, ExpandButton))
    // Stage two for the guide: it declares the chain child it hosts and reads
    // the registry's entry boxes, which an ordinary type has no reason to do.
    const guideInjected: GuideInjected = {
      hooks: {
        guideEntries: { subscribe: listener => tabs.subscribe(listener), getSnapshot: () => tabs.guide() },
        guideWorkbench: controller,
        guidePreferences: preferences,
      },
    }
    const disposeGuide = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: GUIDE_ID,
      locale: NS,
      children: {
        'sidebar.right.tab.guide': {
          kind: 'chain', scope: 'session', inject: { hooks: { tabInfo: guideTabInfoFactory } },
        },
      },
      inject: () => guideInjected,
    }, GuideBody))
    const disposeGuideTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab.title',
      key: GUIDE_ID,
    }, GuideTitle))
    return () => {
      disposeGuideTitle()
      disposeGuide()
      disposeExpand()
      disposeSeat()
      for (const dispose of disposeTypes.reverse()) dispose()
      for (const release of adoptions.values()) release()
    }
  }, 'ui-sidebar-right: seats and shipped tab type')
}
