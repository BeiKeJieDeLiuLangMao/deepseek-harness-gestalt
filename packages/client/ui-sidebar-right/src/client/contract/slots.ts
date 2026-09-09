/**
 * The right Sidebar's extension seats and its copy namespace.
 *
 * Eight seats, each with a different reason to exist:
 * - `sidebar.right.pane.tab` is how a tab type contributes a body. It is keyed by
 *   the type definition's `id`, so adding a type is a registration, never an
 *   edit here. The key domain stays the open string space because a tab type may
 *   ship from outside this repository.
 * - `sidebar.right.pane.tab.title` is the same dispatch for what the chip shows
 *   as the tab's title. Registering is optional: without an entry the chip shows
 *   the title the registry captured when the tab opened.
 * - `sidebar.right.tab.guide` lets a product replace the guide tab's contents
 *   without replacing the tab. It is a chain because the replacement decides for
 *   itself whether it applies, and the shipped guide is the owner's fallback.
 * - `sidebar.right.tab.menu.item` extends a tab's actions menu. The kit owns the
 *   actions that are gestures on the layout itself; this seat is for actions that
 *   mean something about the tab's content.
 * - `sidebar.right.tab.icon` and `sidebar.right.viewer.icon` let a descriptor
 *   supply a React icon under its stable id when a renderer-independent string
 *   token is insufficient.
 * - `sidebar.right.tab.settings` and `sidebar.right.viewer.settings` let a
 *   descriptor with `settings.custom` supply its feature-owned settings body.
 *
 * TYPE HOME RATIONALE: this package declares all four at runtime, and anything
 * registering into one already depends on it for the declaration. The types
 * therefore live with their declarer.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { RightbarOwnerProps } from '@deepseek-ai/dsh-client-ui-layout/client'
// The locale plugin's own merge carries the shared `common` vocabulary that the
// lookup chain consults after this namespace misses.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PaneId, TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import type { TabHookContext } from '../tab-info.ts'
import type { SidebarRightKey } from '../locales.ts'
import type { SidebarRightNavigationParams, SidebarRightResourceParams, SidebarRightTabParamsFor } from './params.ts'
import type { SidebarRightTabPayload, SidebarRightTabPayloadFor, SidebarRightTabPin } from './payload.ts'
import type { SidebarWorkbenchSurface } from '../stores.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Right-Sidebar chrome, docking-kit vocabulary, and guide copy. */
    sidebarRight: SidebarRightKey
  }

  interface SlotMap {
    /** Session content selected by the root-scoped right Sidebar controller. */
    'rightbar.session': { kind: 'single'; scope: 'session'; owner: RightbarOwnerProps }
    /**
     * One tab's body, dispatched with the `id` of the type in force for
     * `tab.kind`. A tab type registers here under its definition's `id` and
     * receives every tab of that kind, in every pane, docked or floating. A kind
     * with no type in force renders the owner's "nothing can view this" notice
     * rather than an empty pane.
     */
    'sidebar.right.pane.tab': {
      kind: 'keyed'
      scope: 'session'
      hookContext: TabHookContext
      inject: SidebarRightTabInjected
    }
    /**
     * A tab's title as its chip (and a floating panel's header) shows it,
     * dispatched with the same key and information hook as the body. A type with a
     * live title — a terminal named after its shell, a chat after its first
     * line — registers here and reads its own store; one without registers
     * nothing and the chip shows the registry's `title(address)` text captured
     * at open time.
     */
    'sidebar.right.pane.tab.title': {
      kind: 'keyed'
      scope: 'session'
      hookContext: TabHookContext
      inject: SidebarRightTabInjected
    }
    /**
     * The guide tab's body. Selectors run in chain order and the first
     * non-declining entry replaces the shipped guide entirely; with no entry, or
     * with every entry declining, the shipped guide renders.
     */
    'sidebar.right.tab.guide': {
      kind: 'chain'
      scope: 'session'
      hookContext: UseSidebarRightTabInfo
      inject: { hooks: { tabInfo: SlotHookFactory<'sidebar.right.tab.guide', UseSidebarRightTabInfo> } }
    }
    /**
     * Extra items at the end of one tab's actions menu, in registration order.
     * Entries decide their own visibility from the tab they are given. Without a
     * registrant the menu shows only the kit's own layout actions.
     */
    'sidebar.right.tab.menu.item': { kind: 'list'; scope: 'session'; owner: SidebarRightTabMenuOwnerProps }
    /** Custom tab icon, dispatched with the tab definition id. */
    'sidebar.right.tab.icon': {
      kind: 'keyed'
      scope: 'session'
      owner: SidebarRightDescriptorIconOwnerProps
    }
    /** Custom viewer icon, dispatched with the viewer definition id. */
    'sidebar.right.viewer.icon': {
      kind: 'keyed'
      scope: 'session'
      owner: SidebarRightDescriptorIconOwnerProps
    }
    /** Custom tab settings body, dispatched with the tab definition id. */
    'sidebar.right.tab.settings': {
      kind: 'keyed'
      scope: 'root'
      owner: SidebarRightDescriptorSettingsOwnerProps
    }
    /** Custom viewer settings body, dispatched with the viewer definition id. */
    'sidebar.right.viewer.settings': {
      kind: 'keyed'
      scope: 'root'
      owner: SidebarRightDescriptorSettingsOwnerProps
    }
  }
}

/** Owner share for a descriptor's keyed custom icon. */
export interface SidebarRightDescriptorIconOwnerProps {
  /** Requested square icon size in CSS pixels. */
  readonly size: number
}

/** Owner share for a descriptor's keyed custom settings body. */
export interface SidebarRightDescriptorSettingsOwnerProps {
  /** Stable tab or viewer definition id used to dispatch this entry. */
  readonly descriptorId: string
  /** Durable plugin-settings blob id, which may differ during key retention. */
  readonly settingsId: string
  /** Close the containing settings surface. */
  readonly close: () => void
}

/** Where a tab was last navigated to: what the `open` that created or revealed it carried. */
export interface SidebarRightTabNavigation {
  /** The address opened; for a tab record this is its `contentId`. */
  readonly address: string
  /** The opener's `params` (see `contract/params.ts`); `undefined` when it gave none. */
  readonly params: SidebarRightNavigationParams
  /**
   * Incremented on every navigation to this tab, whether or not `params`
   * changed, so a body can act on "navigated again" alone. `0` for a record
   * nobody opened by address: a seeded guide, or a tab restored by undo.
   */
  readonly revision: number
}

/** Where an open from a tab lands. Without any of these it lands in the pane holding the tab at call time. */
export interface SidebarRightTabPlacement {
  /** Land in this official surface; without it the current tab's surface is retained. */
  readonly surface?: SidebarWorkbenchSurface
  /** Land a new tab in this pane instead. */
  readonly paneId?: PaneId
  /** Resource tabs reveal existing content by default; `false` permits duplicates. Pages always deduplicate within the target pane. */
  readonly revealIfOpened?: boolean
  /** `false` prepares the occurrence without focusing or expanding its surface. */
  readonly activate?: boolean
  /** `true` opens in this tab's place — its pane and strip slot — and closes this tab in the same step. */
  readonly replaceTab?: boolean
}

/** The actions one tab may take on itself; each acts on the session the tab is in. */
export interface SidebarRightTabActions {
  /**
   * Open a resource from this tab; see `ISidebarRight.openResource`.
   * @param address - a `dsh-resource://` address.
   * @param options - placement and the resource's navigation parameters.
   */
  openResource<K extends string = string>(address: string, options?: SidebarRightTabPlacement & {
    readonly kind?: K
    readonly params?: SidebarRightResourceParams
    readonly payload?: SidebarRightTabPayloadFor<K>
    readonly pin?: SidebarRightTabPin
  }): void
  /**
   * Open a page type from this tab; see `ISidebarRight.openTab`.
   * @param kind - the page type's kind.
   * @param options - placement and that kind's navigation parameters.
   */
  openTab<K extends string>(kind: K, options?: SidebarRightTabPlacement & {
    readonly instanceId?: string
    readonly title?: string
    readonly params?: SidebarRightTabParamsFor<K>
    readonly payload?: SidebarRightTabPayloadFor<K>
    readonly pin?: SidebarRightTabPin
  }): void
  /** Close this tab. */
  close(): void
  /** Update this occurrence's title, JSON payload, or pin in its home Session. */
  update<K extends string>(patch: {
    readonly title?: string
    readonly payload?: SidebarRightTabPayloadFor<K> | undefined
    readonly pin?: SidebarRightTabPin | undefined
  }): void
}

/** Live information shared by a tab's body, title, and guide replacement. */
export interface SidebarRightTabInfo {
  readonly workbench: { readonly surface: SidebarWorkbenchSurface }
  readonly sidebar: {
    readonly expanded: boolean
    /** Presentation selected by manual mode or viewport width; preserved while collapsed. */
    readonly fullscreen: boolean
  }
  readonly panel: { readonly id: PaneId }
  readonly tab: TabRecord & {
    /** Session containing the authoritative record and runtime resource. */
    readonly sessionId: SessionId
    /** Whether this body is a display-only view of another Session's pinned occurrence. */
    readonly virtual: boolean
    /** Docked bodies need an expanded sidebar and an active tab; expanded titles include inactive tabs. Floats stay visible. */
    readonly visible: boolean
    readonly navigation: SidebarRightTabNavigation
    /** Extension-owned persistent JSON, absent when the kind opened without one. */
    readonly payload: SidebarRightTabPayload | undefined
    /** Cross-Session projection ownership; the record itself remains in its home Session. */
    readonly pin: SidebarRightTabPin | undefined
    /** Aborted only when the record disappears or this plugin unloads, not on hide or session switch. */
    readonly signal: AbortSignal
    readonly actions: SidebarRightTabActions
  }
}

/**
 * Read current tab information through the slot framework's subscriptions.
 * @returns the sidebar presentation, containing pane, and live tab record.
 */
export type UseSidebarRightTabInfo = () => SidebarRightTabInfo

/** The slot-owned hook shared by every tab body and title registration. */
export interface SidebarRightTabInjected {
  hooks: { tabInfo: SlotHookFactory<'sidebar.right.pane.tab', UseSidebarRightTabInfo> }
}

/** Owner share of one tab-menu item occurrence. */
export interface SidebarRightTabMenuOwnerProps {
  /** Home Session that owns the occurrence and runtime resource. */
  sessionId: SessionId
  /** Home workbench surface containing the authoritative record. */
  surface: SidebarWorkbenchSurface
  /** The tab whose menu is open. */
  tab: TabRecord
  /** Persistent JSON owned by the tab kind. */
  payload: SidebarRightTabPayload | undefined
  /** Cross-Session pin metadata. */
  pin: SidebarRightTabPin | undefined
  /** Home-Session actions; pinned virtual views never mutate a copied record. */
  actions: SidebarRightTabActions
  /**
   * Dismiss the menu.
   *
   * An item that acts MUST call this: the menu is the kit's, and it closes on
   * its own actions only. An item that leaves it open leaves a menu floating
   * over content the action may have just replaced.
   */
  dismiss: () => void
}
