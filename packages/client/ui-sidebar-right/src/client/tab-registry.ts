/**
 * Stage one of tab-type registration: what a type IS.
 *
 * A registration is purely static — which addresses the type recognizes, how it
 * ranks against other types that recognize the same one, what the tab chip says,
 * and whether the type offers an entry box on the guide page. Nothing here is
 * per-tab, per-session, or a runtime hook: stage two is the keyed
 * `sidebar.right.pane.tab` registration that supplies the body under the same
 * `kind`, and everything a body needs at runtime arrives in its props.
 *
 * Address recognition follows VS Code's editor resolver: a glob declaration
 * narrows the candidates, an optional `canOpen` predicate vetoes, and the
 * survivors are ranked by priority band, then by matched-pattern length, then by
 * registration order. Addresses are `scheme://` URIs; the one local change to
 * VS Code's glob rule is that a pattern containing `:` matches the whole address
 * (`dsh-resource://file/**`, `sidebar://guide`) rather than the URI's path.
 *
 * A kind may carry one `builtin` and one `extension` registration at once: the
 * extension is the one in force — claims, `get`, the guide page, and the body
 * and title, which the seat finds under the definition's own `id` — and the
 * builtin resumes when the extension unregisters. Everything else colliding on
 * a kind throws, as does a second registration of an `id`.
 *
 * Thunked copy (`title`, `guide[].title`) is read again on every use, so a
 * language change needs no re-registration.
 */
import type { ComponentType } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { SidebarRightNavigationParams } from './contract/params.ts'
import type { SidebarRightTabPayload, SidebarRightTabPin } from './contract/payload.ts'
import {
  SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
  type SidebarRightPreferences,
  type SidebarRightPreferencesReader,
  type SidebarRightPreferencesSnapshot,
} from './preferences.ts'
import type { SidebarWorkbenchSurface } from './stores.ts'
// The POSIX build: the browser bundle must not reach for node's `path`, and
// addresses are `/`-separated regardless of the host platform.
import picomatch from 'picomatch/posix'

/**
 * How strongly a type wants an address it recognizes, as one of three literal
 * bands (a string, not an imported constant, so a type shipped from another
 * package needs no runtime import from here).
 *
 * - `extension` — a type from outside the product, and the highest: a type that
 *   declares nothing outranks every viewer shipped here, exactly as in VS Code.
 *   It is also the band that may take over a `builtin` kind.
 * - `builtin` — the ordinary band for types shipped with the product.
 * - `fallback` — plain-content viewers that anything more specific should beat.
 *   VS Code's text editor holds this position implicitly; ours is a separate
 *   package, so it says so.
 */
export type SidebarRightTabPriority = 'extension' | 'builtin' | 'fallback'

/** Rank of each band, highest first. */
const RANKS: Readonly<Record<SidebarRightTabPriority, number>> = {
  extension: 3,
  builtin: 2,
  fallback: 1,
}

/** The band a definition that names none is in. */
const DEFAULT_BAND: SidebarRightTabPriority = 'extension'

/** One entry box the guide page offers, contributed by the type it opens (picking it opens that type as a page). */
export interface SidebarRightGuideEntry {
  /** Ascending position among every registered type's entries. */
  readonly order: number
  /**
   * The box's heading.
   * @returns the heading in the current language.
   */
  readonly title: () => string
  /**
   * One line under the heading.
   * @returns the line in the current language.
   */
  readonly description: () => string
  /** Optional glyph, drawn at the box's leading edge. */
  readonly icon?: ComponentType<IconProps>
}

/** A guide entry as the registry lists it: with the kind of the type that contributed it, which is what picking it opens. */
export interface SidebarRightGuideBox extends SidebarRightGuideEntry {
  readonly kind: string
  /** Page availability evaluated by the Session-scoped guide presentation. */
  readonly available?: (context: SidebarRightDescriptorContext) => boolean
}

/** Why an official occurrence is being asked to release its runtime owner. */
export type SidebarRightCloseReason = 'close' | 'replace' | 'reset' | 'undo' | 'redo'

/** Stable occurrence facts passed to close admission and release hooks. */
export interface SidebarRightTabCloseContext {
  readonly sessionId: SessionId
  readonly surface: SidebarWorkbenchSurface
  readonly tab: TabRecord
  readonly payload: SidebarRightTabPayload | undefined
  readonly pin: SidebarRightTabPin | undefined
  readonly signal: AbortSignal
  readonly reason: SidebarRightCloseReason
}

/** Icon token carried by descriptor inventories; UI packages resolve known tokens and use their fallback for unknown ones. */
export type SidebarRightDescriptorIcon = string

/** One open occurrence projected into descriptor callbacks without exposing a store or UI runtime. */
export interface SidebarRightDescriptorTab {
  readonly id: string
  readonly kind: string
  readonly contentId: string
  readonly title: string
  readonly surface: SidebarWorkbenchSurface
  readonly floating: boolean
  readonly payload: SidebarRightTabPayload | undefined
  readonly pin: SidebarRightTabPin | undefined
}

/** Pure current-state input shared by availability, badge, creation, and dedupe callbacks. */
export interface SidebarRightDescriptorContext {
  readonly sessionId: SessionId
  readonly preferences: SidebarRightPreferences
  readonly tabs: readonly SidebarRightDescriptorTab[]
}

/** One scalar option in a declarative descriptor setting. */
export interface SidebarRightSettingOption {
  readonly value: string | number | boolean
  readonly title: () => string
  readonly description?: () => string
  readonly icon?: SidebarRightDescriptorIcon
}

/** Control rendered for one declarative descriptor setting. */
export type SidebarRightSettingControl = 'switch' | 'text' | 'number' | 'select'

/**
 * One pure settings row. Preference rows name one of the retained global
 * fields; plugin rows write the descriptor's JSON blob.
 */
export interface SidebarRightSettingDefinition {
  readonly key: string
  readonly source: 'preference' | 'plugin'
  readonly control?: SidebarRightSettingControl
  readonly title: () => string
  readonly description?: () => string
  readonly min?: number
  readonly max?: number
  readonly placeholder?: string
  readonly unit?: string
  readonly options?: readonly SidebarRightSettingOption[]
  readonly multiple?: boolean
  /** Mark a setting whose enabled state weakens a security guard. */
  readonly unsafe?: boolean
}

/** Settings inventory attached to one tab or viewer descriptor. */
export interface SidebarRightSettingsDeclaration {
  /** Settings blob identity when retaining an established key instead of the descriptor id. */
  readonly settingsId?: string
  readonly fields: readonly SidebarRightSettingDefinition[]
  /** A keyed settings Slot supplies an additional feature-owned editor. */
  readonly custom?: boolean
}

/** Pure input to a tab definition's occurrence factory. */
export interface SidebarRightTabCreateRequest extends SidebarRightDescriptorContext {
  readonly kind: string
  readonly address: string
  readonly title: string
  readonly params: SidebarRightNavigationParams
  readonly payload: SidebarRightTabPayload | undefined
  readonly pin: SidebarRightTabPin | undefined
}

/** Fields a tab definition may settle before official placement. */
export interface SidebarRightTabCreateResult {
  readonly contentId?: string
  readonly title?: string
  readonly payload?: SidebarRightTabPayload
}

/** How the official viewer host obtains a matched viewer's input. */
export type SidebarRightViewerFetchStrategy = 'none' | 'fsRead' | 'mediaUrl' | 'custom' | 'binary-download'

/** Input to optional viewer content detection. */
export interface SidebarRightViewerDetectRequest {
  readonly address: string
  readonly path: string
  readonly head: Uint8Array
}

/** Input to an abortable custom viewer loader. */
export interface SidebarRightViewerLoadRequest {
  readonly address: string
  readonly path: string
  readonly sessionId: SessionId
  readonly signal: AbortSignal
  readonly settings: Readonly<Record<string, JsonValue>>
}

/** One renderer-independent file viewer contribution. */
export interface SidebarRightViewerDefinition {
  readonly id: string
  readonly title: () => string
  readonly icon?: SidebarRightDescriptorIcon
  /** Lowercase suffixes without a leading dot; an empty list is a catch-all. */
  readonly extensions: readonly string[]
  /** Higher values match first; registration order breaks ties. */
  readonly priority?: number
  readonly fetchStrategy: SidebarRightViewerFetchStrategy
  readonly detect?: (request: SidebarRightViewerDetectRequest) => boolean
  readonly load?: (request: SidebarRightViewerLoadRequest) => Promise<JsonValue | Uint8Array>
  readonly settings?: SidebarRightSettingsDeclaration
}

/** File identity supplied to the official viewer matcher. */
export interface SidebarRightViewerMatchRequest {
  readonly address: string
  readonly path: string
  readonly head?: Uint8Array
}


/** One registered tab type: its static face, and nothing else. */
export interface SidebarRightTabDefinition {
  /**
   * This implementation's identity in the tab system, unique across every
   * registration (a package name is the natural value). A kind is not unique —
   * an extension may take a builtin's over — so the implementation carries its
   * own name, and it is the key its body and title register under in the
   * `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title` seats.
   */
  readonly id: string
  /** Type discriminator: what the tabs of this type are, and what `openTab` names. */
  readonly kind: string
  /** Ascending position in add menus and settings inventories; defaults to 100 in presentation. */
  readonly order?: number
  /** Hide this type from ordinary add actions while keeping direct opens valid. */
  readonly hidden?: boolean
  /** Renderer-independent icon token for chips and settings inventory. */
  readonly icon?: SidebarRightDescriptorIcon
  /**
   * Resource-address globs this type recognizes; omit for a page type, which is
   * opened by kind and recognizes no address.
   *
   * A pattern containing `:` is matched against the whole address
   * (`dsh-resource://file/**`); one without is matched against the URI's path at
   * any depth (`*.md` matches `dsh-resource://file/session/s1/home/me/notes.md`),
   * and an address that is not a URI matches no such pattern. Matching ignores
   * case and does not hide dotfiles.
   */
  readonly patterns?: readonly string[]
  /** Defaults to `extension`: a type that says nothing is one from outside the product. */
  readonly priority?: SidebarRightTabPriority
  /**
   * Veto an address this type's globs matched.
   *
   * Synchronous and cheap: it runs on every routing decision. Omit it to accept
   * every match.
   * @param address - the matched address.
   * @returns whether this type will open it.
   */
  readonly canOpen?: (address: string) => boolean
  /**
   * The tab chip's initial text, captured into the layout record at open time.
   * @param address - the address being opened.
   * @returns the title in the current language.
   */
  readonly title: (address: string) => string
  /** Whether the add action is currently available. Direct navigation does not consult this hint. */
  readonly available?: (context: SidebarRightDescriptorContext) => boolean
  /** Single-instance shorthand for a descriptor-wide dedupe key. */
  readonly single?: boolean
  /** Stable instance key over pure occurrence facts; `undefined` permits another instance. */
  readonly dedupeKey?: (tab: SidebarRightDescriptorTab) => string | undefined
  /** Settle identity/title/payload before official placement; `false` refuses creation. */
  readonly create?: (request: SidebarRightTabCreateRequest) => SidebarRightTabCreateResult | false
  /** Observe a newly committed occurrence once; failures are reported without undoing the open. */
  readonly onOpen?: (
    tab: SidebarRightDescriptorTab,
    context: SidebarRightDescriptorContext,
  ) => void
  /** Observe a focus of an existing occurrence; failures are reported without undoing the focus. */
  readonly onActivate?: (
    tab: SidebarRightDescriptorTab,
    context: SidebarRightDescriptorContext,
  ) => void
  /** Tab-strip badge derived from pure occurrence and preference facts. */
  readonly badge?: (
    tab: SidebarRightDescriptorTab,
    context: SidebarRightDescriptorContext,
  ) => string | number | null | undefined
  /** Declarative settings inventory. Additional UI belongs in the keyed settings Slot. */
  readonly settings?: SidebarRightSettingsDeclaration
  /** Claim an external URL before the built-in Browser fallback. */
  readonly urlTarget?: (url: URL) => boolean
  /** Entry boxes for the guide page. Omit to stay off it. */
  readonly guide?: readonly SidebarRightGuideEntry[]
  /**
   * Admit a true occurrence close before any layout or runtime mutation.
   * Returning `false` or rejecting cancels the whole requested batch.
   */
  readonly beforeClose?: (context: SidebarRightTabCloseContext) => boolean | void | Promise<boolean | void>
  /**
   * Release the runtime owner after every batch member was admitted. A record
   * is removed only when this hook fulfils; a failed record remains visible.
   */
  readonly close?: (context: SidebarRightTabCloseContext) => void | Promise<void>
}

/** What a routing decision settles on: who draws the address, and as what. */
export interface SidebarRightTabClaim {
  /** The claiming type. */
  readonly kind: string
  /**
   * Stable identity of the content, which is the address itself.
   *
   * Two opens of the same address are the same tab, which is what makes opening
   * idempotent.
   */
  readonly contentId: string
  /** Title for the tab chip. */
  readonly title: string
}

/** A registered type with its patterns compiled. */
interface Registered {
  readonly definition: SidebarRightTabDefinition
  readonly band: SidebarRightTabPriority
  /** One matcher per declared pattern, in declaration order. */
  readonly matchers: readonly { readonly pattern: string; readonly test: (address: string) => boolean }[]
  /** Registration position across every kind, the last tiebreaker. */
  readonly order: number
}

/** A viewer with its registration-order tiebreaker. */
interface RegisteredViewer {
  readonly definition: SidebarRightViewerDefinition
  readonly order: number
}

/** All-enabled fallback until a settings scope is composed or accepted. */
const DEFAULT_SETTINGS_READER: SidebarRightPreferencesReader = {
  getSnapshot: (): SidebarRightPreferencesSnapshot => ({
    status: 'unavailable',
    preferences: SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
    revision: undefined,
    writable: false,
  }),
  subscribe: () => () => {},
  isTabEnabled: () => true,
  isViewerEnabled: () => true,
  pluginSettings: () => ({}),
  htmlViewerSafety: () => ({ forceUnsandboxed: false, defaultUnsandboxed: false }),
}

/**
 * Everything registered under one kind: the registration in force and, while
 * an `extension` holds a kind a `builtin` also registered, the builtin it
 * shadows. A kind is in the registry's map exactly while something is in force
 * for it, so a held slot always answers.
 */
interface KindSlot {
  inForce: Registered
  shadowed: Registered | undefined
}

/**
 * Whether a band may join a held kind: an `extension` and a `builtin` pair up
 * once, and a `fallback` shares its kind with nothing.
 */
function coexists(slot: KindSlot, band: SidebarRightTabPriority): boolean {
  return band !== 'fallback' && slot.inForce.band !== 'fallback' && slot.inForce.band !== band && slot.shadowed === undefined
}

/** How a candidate ranked, kept only while `candidates` is sorting. */
interface Ranked {
  readonly definition: SidebarRightTabDefinition
  readonly rank: number
  /** Length of the longest pattern that matched, VS Code's specificity measure. */
  readonly length: number
  /** Registration position, the last tiebreaker. */
  readonly order: number
}

/**
 * The address's URI path: what a pattern with no scheme separator matches
 * against. `dsh-resource://file/session/s1/home/me/b.md` gives `/session/s1/home/me/b.md`;
 * `sidebar://guide` gives `''`; an address that is not a URI gives nothing.
 */
function pathOf(address: string): string | undefined {
  try {
    return new URL(address).pathname
  } catch {
    // The only thrower is the URL parser rejecting a non-URI address, which by
    // the rule above matches no path pattern.
    return undefined
  }
}

/** Compile one declared pattern into the test the router runs. */
function matcherFor(pattern: string): (address: string) => boolean {
  // `basename: true` is what makes `*.md` match at any depth; it applies only to
  // patterns without a separator, which is exactly the path case.
  const whole = pattern.includes(':')
  const match = picomatch(pattern, { nocase: true, dot: true, ...whole ? {} : { basename: true } })
  return (address) => {
    if (whole) return match(address)
    const path = pathOf(address)
    return path !== undefined && match(path)
  }
}

/** Reject settings rows that cannot be routed to the official preference owner. */
function validateSettings(owner: string, declaration: SidebarRightSettingsDeclaration | undefined): void {
  if (declaration === undefined) return
  if (declaration.settingsId !== undefined && declaration.settingsId.length === 0) {
    throw new Error(`sidebarRight: ${owner} settings id must not be empty`)
  }
  const seen = new Set<string>()
  for (const field of declaration.fields) {
    const identity = `${field.source}\u0000${field.key}`
    if (field.key.length === 0 || seen.has(identity)) {
      throw new Error(`sidebarRight: ${owner} settings contain an empty or duplicate key`)
    }
    seen.add(identity)
    if (field.source === 'preference' && !Object.hasOwn(SIDEBAR_RIGHT_PREFERENCES_DEFAULTS, field.key)) {
      throw new Error(`sidebarRight: ${owner} setting "${field.key}" is not an official preference`)
    }
    if (field.control === 'select' && (field.options === undefined || field.options.length === 0)) {
      throw new Error(`sidebarRight: ${owner} select setting "${field.key}" has no options`)
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      throw new Error(`sidebarRight: ${owner} setting "${field.key}" has an inverted range`)
    }
  }
}

/**
 * The registered tab types.
 *
 * Registration order is part of the contract: it breaks ties between types that
 * recognize an address equally well.
 */
export class SidebarRightTabRegistry {
  private readonly kinds = new Map<string, KindSlot>()
  private readonly ids = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private registrations = 0
  private readonly viewerEntries = new Map<string, RegisteredViewer>()
  private viewerRegistrations = 0
  private cached: readonly SidebarRightTabDefinition[] = []
  private cachedViewers: readonly SidebarRightViewerDefinition[] = []
  private guideEntries: readonly SidebarRightGuideBox[] = []

  /**
   * @param ctx - Context whose effects own the contributed types.
   * @param settings - official global enablement/settings owner.
   */
  constructor(
    private readonly ctx: Context,
    private readonly settings: SidebarRightPreferencesReader = DEFAULT_SETTINGS_READER,
  ) {
    ctx.effect(() => settings.subscribe(() => { this.refresh() }), 'sidebarRight.tabs: preferences')
  }

  /**
   * Register one tab type for the caller's lifetime.
   *
   * The caller holds the returned disposer inside its own `ctx.effect`, so a
   * type's registration lives exactly as long as the plugin that contributed it.
   * An `extension` may register a kind a `builtin` already holds and takes it
   * over until it unregisters; a second registration in the same band, or any
   * registration meeting a `fallback` of the same kind, is a wiring mistake, and
   * so is an `id` already in use.
   * @param definition - the contributed type.
   * @returns idempotent disposer.
   * @throws when the id is taken, or the kind is already registered in a way this one cannot coexist with.
   */
  register(definition: SidebarRightTabDefinition): () => void {
    const { id, kind } = definition
    const band = definition.priority ?? DEFAULT_BAND
    validateSettings(`tab "${id}"`, definition.settings)
    if (this.ids.has(id)) throw new Error(`sidebarRight: tab type id "${id}" is already registered`)
    const held = this.kinds.get(kind)
    if (held !== undefined && !coexists(held, band)) {
      throw new Error(`sidebarRight: tab kind "${kind}" is already registered (${held.inForce.band})`)
    }
    this.registrations += 1
    const entry: Registered = {
      definition,
      band,
      matchers: (definition.patterns ?? []).map(pattern => ({ pattern, test: matcherFor(pattern) })),
      order: this.registrations,
    }
    const dispose = this.ctx.effect(() => {
      this.ids.add(id)
      const slot = this.enter(kind, entry)
      this.refresh()
      return () => {
        this.ids.delete(id)
        this.leave(kind, slot, entry)
        this.refresh()
      }
    }, `sidebarRight.tabs.register(${JSON.stringify(id)})`)
    return () => { void dispose() }
  }

  /**
   * Register one renderer-independent file viewer for the caller's lifetime.
   * @param definition - viewer matching, loading, and settings declaration.
   * @returns idempotent HMR-safe disposer.
   */
  registerViewer(definition: SidebarRightViewerDefinition): () => void {
    validateSettings(`viewer "${definition.id}"`, definition.settings)
    if (this.viewerEntries.has(definition.id)) {
      throw new Error(`sidebarRight: viewer id "${definition.id}" is already registered`)
    }
    if (definition.extensions.some(extension => extension.startsWith('.') || extension !== extension.toLowerCase())) {
      throw new Error(`sidebarRight: viewer "${definition.id}" extensions must be lowercase without a leading dot`)
    }
    if (definition.fetchStrategy === 'custom' && definition.load === undefined) {
      throw new Error(`sidebarRight: custom viewer "${definition.id}" must declare load`)
    }
    this.viewerRegistrations += 1
    const registered: RegisteredViewer = { definition, order: this.viewerRegistrations }
    const dispose = this.ctx.effect(() => {
      this.viewerEntries.set(definition.id, registered)
      this.refresh()
      return () => {
        if (this.viewerEntries.get(definition.id) === registered) {
          this.viewerEntries.delete(definition.id)
          this.refresh()
        }
      }
    }, `sidebarRight.viewers.register(${JSON.stringify(definition.id)})`)
    return () => { void dispose() }
  }

  /** Add a registration to its kind's slot, the higher band in force; `coexists` has already admitted it. */
  private enter(kind: string, entry: Registered): KindSlot {
    const held = this.kinds.get(kind)
    if (held === undefined) {
      const slot: KindSlot = { inForce: entry, shadowed: undefined }
      this.kinds.set(kind, slot)
      return slot
    }
    if (RANKS[entry.band] > RANKS[held.inForce.band]) {
      held.shadowed = held.inForce
      held.inForce = entry
    } else {
      held.shadowed = entry
    }
    return held
  }

  /** Remove a registration from its kind's slot: a shadowed builtin resumes, and an emptied kind is freed. */
  private leave(kind: string, slot: KindSlot, entry: Registered): void {
    if (slot.inForce !== entry) {
      slot.shadowed = undefined
    } else if (slot.shadowed === undefined) {
      this.kinds.delete(kind)
    } else {
      slot.inForce = slot.shadowed
      slot.shadowed = undefined
    }
  }

  /** Every kind's registration in force, in registration order. */
  private active(): Registered[] {
    return [...this.kinds.values()].map(slot => slot.inForce).sort((left, right) => left.order - right.order)
  }

  /**
   * Registered types in registration order.
   * @returns reference-stable entries.
   */
  entries(): readonly SidebarRightTabDefinition[] {
    return this.cached
  }

  /**
   * Registered viewer definitions in registration order.
   * @returns reference-stable inventory until a registration or preference changes.
   */
  viewers(): readonly SidebarRightViewerDefinition[] {
    return this.cachedViewers
  }

  /**
   * Whether the current settings document admits new occurrences of a tab definition.
   * @param id - stable definition id.
   * @returns false only for an explicit disable entry.
   */
  isTabEnabled(id: string): boolean {
    return this.settings.isTabEnabled(id)
  }

  /**
   * Whether the current settings document includes a viewer in matching.
   * @param id - stable viewer id.
   * @returns false only for an explicit disable entry.
   */
  isViewerEnabled(id: string): boolean {
    return this.settings.isViewerEnabled(id)
  }

  /**
   * Current global preferences for pure descriptor callbacks.
   * @returns the official settings owner's current immutable value.
   */
  preferences(): SidebarRightPreferences {
    return this.settings.getSnapshot().preferences
  }

  /**
   * Every type in force's guide entries, in `order`, each naming the kind it opens.
   * @returns reference-stable entries.
   */
  guide(): readonly SidebarRightGuideBox[] {
    return this.guideEntries
  }

  /**
   * The type in force for a kind.
   * @param kind - the type discriminator.
   * @returns the type, or `undefined` when nothing registered it.
   */
  get(kind: string): SidebarRightTabDefinition | undefined {
    return this.kinds.get(kind)?.inForce.definition
  }

  /**
   * Every type that would open an address, best first.
   *
   * Ranked by priority band, then by the length of the pattern that matched,
   * then by registration order. Types whose `canOpen` vetoes are absent.
   * @param address - the address a caller wants opened.
   * @returns the ranked types; empty when nothing recognizes the address.
   */
  candidates(address: string): readonly SidebarRightTabDefinition[] {
    const ranked: Ranked[] = []
    for (const { definition, band, matchers, order } of this.active()) {
      if (!this.settings.isTabEnabled(definition.id)) continue
      let length = -1
      for (const matcher of matchers) {
        if (matcher.test(address) && matcher.pattern.length > length) length = matcher.pattern.length
      }
      if (length < 0) continue
      if (definition.canOpen !== undefined && !definition.canOpen(address)) continue
      ranked.push({ definition, rank: RANKS[band], length, order })
    }
    ranked.sort((left, right) =>
      right.rank - left.rank || right.length - left.length || left.order - right.order)
    return ranked.map(entry => entry.definition)
  }

  /**
   * Decide which type opens an address, and as what.
   *
   * Without `kind`, the best candidate wins. With `kind`, that type opens the
   * address if its `canOpen` agrees — its globs are not consulted, because
   * naming the type IS the decision.
   *
   * An address no type will open is a wiring mistake, not a user error, so this
   * throws rather than reporting absence.
   * @param address - the address a caller wants opened.
   * @param kind - a type named by the caller, overriding the ranking.
   * @returns the claiming type and the record to open.
   */
  claim(address: string, kind?: string): SidebarRightTabClaim {
    if (kind !== undefined) {
      const definition = this.get(kind)
      if (definition === undefined) {
        throw new Error(`sidebarRight: no tab type is registered as "${kind}"`)
      }
      if (!this.settings.isTabEnabled(definition.id)) {
        throw new Error(`sidebarRight: tab type "${kind}" is disabled`)
      }
      if (definition.canOpen !== undefined && !definition.canOpen(address)) {
        throw new Error(`sidebarRight: tab type "${kind}" refuses "${address}"`)
      }
      return { kind, contentId: address, title: definition.title(address) }
    }
    const [chosen] = this.candidates(address)
    if (chosen === undefined) {
      throw new Error(`sidebarRight: no registered tab type claims "${address}"`)
    }
    return { kind: chosen.kind, contentId: address, title: chosen.title(address) }
  }

  /**
   * Match the highest-priority enabled viewer. Detection runs before suffixes
   * for each candidate; a detect-only catch-all yields until head bytes exist.
   * @param request - resource identity, path, and optional leading bytes.
   * @returns matched viewer, or `undefined`.
   */
  matchViewer(request: SidebarRightViewerMatchRequest): SidebarRightViewerDefinition | undefined {
    const extension = extensionOf(request.path)
    const ranked = [...this.viewerEntries.values()].sort((left, right) =>
      (right.definition.priority ?? 0) - (left.definition.priority ?? 0) || left.order - right.order)
    for (const { definition } of ranked) {
      if (!this.settings.isViewerEnabled(definition.id)) continue
      if (request.head !== undefined && definition.detect !== undefined) {
        if (definition.detect({ address: request.address, path: request.path, head: request.head })) return definition
        if (definition.extensions.length === 0) continue
      } else if (definition.extensions.length === 0) {
        if (definition.detect === undefined) return definition
        continue
      }
      if (definition.extensions.includes(extension)) return definition
    }
    return undefined
  }

  /**
   * First enabled tab definition whose URL predicate claims the target.
   * @param url - external URL considered for workbench routing.
   * @returns claiming definition, or `undefined`.
   */
  matchUrlTarget(url: URL): SidebarRightTabDefinition | undefined {
    for (const { definition } of this.active()) {
      if (!this.settings.isTabEnabled(definition.id) || definition.urlTarget === undefined) continue
      try {
        if (definition.urlTarget(url)) return definition
      } catch (error: unknown) {
        console.error(`sidebarRight: urlTarget failed for "${definition.id}"`, error)
      }
    }
    return undefined
  }

  /**
   * Observe low-frequency registry changes.
   * @param listener - synchronous invalidation callback.
   * @returns unsubscribe callback.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private refresh(): void {
    this.cached = this.active().map(entry => entry.definition)
    this.cachedViewers = [...this.viewerEntries.values()]
      .sort((left, right) => left.order - right.order)
      .map(entry => entry.definition)
    this.guideEntries = this.cached
      .filter(definition => this.settings.isTabEnabled(definition.id))
      .flatMap(definition => (definition.guide ?? []).map(entry => ({
        ...entry,
        kind: definition.kind,
        ...(definition.available === undefined ? {} : { available: definition.available }),
      })))
      .sort((left, right) => left.order - right.order)
    notifySubscribers(this.listeners, '[ui-sidebar-right] tab registry')
  }
}

/** Lowercase final suffix of one resource path. */
function extensionOf(path: string): string {
  const leaf = path.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = leaf.lastIndexOf('.')
  return dot <= 0 || dot === leaf.length - 1 ? '' : leaf.slice(dot + 1).toLowerCase()
}
