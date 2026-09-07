/**
 * Per-session model directory: the ONE state both selection entries share.
 * The /model popup and composer seat combine one shared Host catalog with the
 * stock Session projection or feature inspection, then submit through the same
 * selectModel call. A switch made in either entry updates this shared state.
 */
import type {
  ModelCatalogFailure, ModelProviderGroup, ModelSelection, ModelSelectionProjection,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type {
  SessionModelInspection, SessionModelRoute,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelCatalogDirectory } from './catalog.ts'

/** Directory snapshot both entries render from. */
export interface ModelDirectoryState {
  /** Live `sessions.modelRoute` presence; late hide must refuse select. */
  available: boolean
  /** Effective selection: durable next-request projection, then Host default. */
  current: ModelSelection | null
  /**
   * Whether an adapter serves the current selection's provider, as the host reports
   * it — null before the first load, which is NOT the same as blocked. Read
   * this rather than "current matches no group": catalog membership is
   * advisory, so a route serving a model it stopped advertising is missing
   * from the groups yet perfectly usable.
   */
  routable: boolean | null
  /** Successfully loaded provider groups (last good load). */
  groups: readonly ModelProviderGroup[]
  /** Provider-local failures from the last load; usable groups stay usable. */
  failures: readonly ModelCatalogFailure[]
  /** Lifecycle of the in-flight operation. */
  status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  /** Whole-request or selection failure text; null when none. */
  error: string | null
}

/** One session's shared directory controller; disposed with the session scope. */
export class ModelDirectory {
  /** The shared snapshot both entries render from (uSES-safe store). */
  readonly store: SnapshotStore<ModelDirectoryState> = createSnapshotStore<ModelDirectoryState>({
    available: false, current: null, routable: null, groups: [], failures: [], status: 'idle', error: null,
  })

  /** Latest selection operation wins; an older response never overwrites a newer one. */
  private generation = 0
  private disposed = false
  private resolved = false
  private inspected: SessionModelInspection | undefined
  private readonly unsubscribeCatalog: () => void
  private readonly unsubscribeSelection: () => void
  private readonly unsubscribeAdmission: () => void

  /**
   * @param routeOf - live `sessions.modelRoute` for this identity.
   * @param catalog - Host-generation catalog shared by every Session.
   * @param projected - durable model selection projected from Session history.
   * @param subscribeAdmission - admission register/replace/revoke channel.
   */
  constructor(
    private readonly routeOf: () => SessionModelRoute | undefined,
    private readonly catalog: ModelCatalogDirectory,
    private readonly projected: ObservableSnapshot<unknown>,
    subscribeAdmission?: (listener: () => void) => () => void,
  ) {
    this.unsubscribeCatalog = catalog.store.subscribe(() => { this.syncInputs() })
    this.unsubscribeSelection = projected.subscribe(() => { this.syncInputs() })
    this.unsubscribeAdmission = subscribeAdmission?.(() => {
      ++this.generation
      this.inspected = undefined
      this.syncInputs()
      if (this.routeOf()?.kind === 'feature') {
        void this.load().catch(() => { /* the selector exposes the inspection failure */ })
      }
    }) ?? (() => {})
    this.syncInputs()
  }

  /**
   * Ensure the Host generation's shared advisory catalog is loaded.
   * @returns the fresh directory value.
   */
  async load(): Promise<ModelDirectoryState> {
    const route = this.requireRoute()
    const generation = ++this.generation
    if (route.kind === 'feature') {
      this.store.update((state) => { state.status = 'loading'; state.error = null })
    }
    const [inspection] = await Promise.all([
      route.kind === 'feature' ? route.inspect() : Promise.resolve(undefined),
      this.catalog.load(),
    ])
    if (inspection?.ok === false) {
      const message = `${inspection.error.code}: ${inspection.error.message}`
      if (!this.disposed && generation === this.generation) {
        this.store.update((state) => { state.status = 'error'; state.error = message })
      }
      throw new Error(`session model inspection failed: ${message}`)
    }
    if (this.disposed || generation !== this.generation) return this.store.getSnapshot()
    this.inspected = inspection?.value
    this.syncInputs()
    return this.store.getSnapshot()
  }

  /**
   * Select the complete provider/model/reasoning selection. A stock projection
   * frame or a feature inspection updates the shared current; failures surface
   * on the store and throw so each entry's own retry surface engages.
   * @param selection - provider, provider-owned model id, and optional adapter-owned effort.
 */
  async select(selection: ModelSelection): Promise<void> {
    const route = this.requireRoute()
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'selecting'; s.error = null })
    const result = await route.selectModel(selection)
    if (this.disposed || generation !== this.generation) {
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return
    }
    if (!result.ok) {
      this.store.update((s) => { s.status = 'error'; s.error = `${result.error.code}: ${result.error.message}` })
      throw new Error(`session.selectModel failed: ${result.error.code}: ${result.error.message}`)
    }
    if (route.kind === 'feature') {
      const inspection = await route.inspect()
      if (this.disposed || generation !== this.generation) {
        if (!inspection.ok) throw new Error(`${inspection.error.code}: ${inspection.error.message}`)
        return
      }
      if (!inspection.ok) {
        const message = `${inspection.error.code}: ${inspection.error.message}`
        this.store.update((state) => { state.status = 'error'; state.error = message })
        throw new Error(`session model inspection failed: ${message}`)
      }
      this.inspected = inspection.value
    }
    this.store.update((s) => { s.status = 'ready'; s.error = null })
    this.syncInputs()
  }

  /**
   * Invalidate an in-flight selection response from the previous Host generation.
   */
  resetConnected(): void {
    if (this.disposed) return
    ++this.generation
    this.inspected = undefined
    this.store.update((state) => {
      if (state.status === 'selecting') state.status = 'idle'
      state.error = null
    })
    this.syncInputs()
    if (this.routeOf()?.kind === 'feature') {
      void this.load().catch(() => { /* the selector exposes the inspection failure */ })
    }
  }

  /** Scope teardown: late settlements lose write access to the store. */
  dispose(): void {
    this.disposed = true
    this.unsubscribeSelection()
    this.unsubscribeCatalog()
    this.unsubscribeAdmission()
  }

  private requireRoute(): SessionModelRoute {
    const route = this.routeOf()
    if (route === undefined) {
      throw new Error('model selection is unavailable for this session')
    }
    return route
  }

  private syncInputs(): void {
    if (this.disposed) return
    const route = this.routeOf()
    const available = route !== undefined
    const catalog = this.catalog.store.getSnapshot()
    const projected = modelSelectionProjection(this.projected.getSnapshot())
    const stockCurrent = projected?.next ?? catalog.value?.default
    const routeState = route === undefined
      ? undefined
      : route.kind === 'feature'
        ? this.inspected
        : projected === undefined || stockCurrent === undefined || catalog.value === null
          ? undefined
          : {
            current: stockCurrent,
            routable: catalog.value.routableProviders.includes(stockCurrent.provider),
          }
    if (catalog.status !== 'ready' || catalog.value === null || routeState === undefined) {
      if (this.resolved) {
        this.store.update((state) => {
          state.available = available
          if (catalog.status === 'error') {
            state.status = 'error'
            state.error = catalog.error
          }
        })
        return
      }
      this.store.set({
        available,
        current: null,
        routable: null,
        groups: [],
        failures: [],
        status: catalog.status === 'error' ? 'error' : 'loading',
        error: catalog.error,
      })
      return
    }
    const current = routeState.current
    this.resolved = true
    this.store.set({
      available,
      current,
      routable: routeState.routable,
      groups: catalog.value.groups,
      failures: catalog.value.failures,
      status: this.store.getSnapshot().status === 'selecting'
        ? 'selecting'
        : 'ready',
      error: null,
    })
  }
}

function modelSelectionProjection(value: unknown): ModelSelectionProjection | undefined {
  return value === undefined ? undefined : value as ModelSelectionProjection
}
