// Shared scaffolding for the assembled-jsdom snapshots: the real built
// workspace `lib/client.js` artifacts booted through AppWebEntry's
// ModuleLoader path (loadBundle) against the keyless FixtureApiClient
// transport. Every file that mounts this graph needs the same boot entry list,
// the same bundle map, the same jsdom globals, and the same mount call, and
// differs only in what it asserts afterwards, so the scaffolding lives here.
//
// Keyless and deterministic: the fixture is the fake server, so nothing here
// reaches a model or the network.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import type { WebBootEntry } from '@deepseek-ai/dsh-client-modules/client'
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'

/** Boot entries for the minimal assembled graph, each carrying the workspace bundle it loads. */
const PLUGINS: readonly (WebBootEntry & { bundlePath: string })[] = [
  { id: '@deepseek-ai/dsh-typert-registry', bundlePath: 'packages/typert/registry/lib/client.js', url: '/plugins/typert-registry.js', rev: 'fx', inject: [], immediately: true },
  { id: '@deepseek-ai/dsh-client-connection', bundlePath: 'packages/client/connection/lib/client.js', url: '/plugins/connection.js', rev: 'fx', inject: [], immediately: true },
  { id: '@deepseek-ai/dsh-api-gateway', bundlePath: 'packages/api/gateway/lib/client.js', url: '/plugins/api-gateway.js', rev: 'fx', inject: ['@deepseek-ai/dsh-typert-registry', '@deepseek-ai/dsh-client-connection'], immediately: true },
  { id: '@deepseek-ai/dsh-api-remotes', bundlePath: 'packages/api/remotes/lib/client.js', url: '/plugins/api-remotes.js', rev: 'fx', inject: ['@deepseek-ai/dsh-api-gateway'], immediately: true },
  // The settings domain base: the only provider of ctx.settingsScope, which the
  // locale and ui-theme rows below inject for their preference rows. Without it
  // both stay pending and ui-layout never activates, so nothing renders.
  { id: '@deepseek-ai/dsh-client-ui-settings', bundlePath: 'packages/client/ui-settings/lib/client.js', url: '/plugins/ui-settings.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-api-remotes'], immediately: true },
  { id: '@deepseek-ai/dsh-client-runtime', bundlePath: 'packages/client/runtime/lib/client.js', url: '/plugins/runtime.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-typert-registry', '@deepseek-ai/dsh-api-gateway'], immediately: true },
  { id: '@deepseek-ai/dsh-client-ui-theme', bundlePath: 'packages/client/ui-theme/lib/client.js', url: '/plugins/ui-theme.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-api-remotes'], immediately: true },
  { id: '@deepseek-ai/dsh-client-locale', bundlePath: 'packages/client/locale/lib/client.js', url: '/plugins/locale.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-api-remotes'], immediately: true },
  { id: '@deepseek-ai/dsh-client-ui-layout', bundlePath: 'packages/client/ui-layout/lib/client.js', url: '/plugins/ui-layout.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-runtime'] },
  { id: '@deepseek-ai/dsh-client-ui-sidebar', bundlePath: 'packages/client/ui-sidebar/lib/client.js', url: '/plugins/ui-sidebar.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-ui-layout'] },
  { id: '@deepseek-ai/dsh-client-ui-conversation', bundlePath: 'packages/client/ui-conversation/lib/client.js', url: '/plugins/ui-conversation.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-ui-layout'] },
  { id: '@deepseek-ai/dsh-client-ui-tool', bundlePath: 'packages/client/ui-tool/lib/client.js', url: '/plugins/ui-tool.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-conversation'] },
  { id: '@deepseek-ai/dsh-client-ui-workflow-run', bundlePath: 'packages/client/ui-workflow-run/lib/client.js', url: '/plugins/ui-workflow-run.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-conversation'] },
  {
    id: '@deepseek-ai/dsh-client-ui-workspace',
    bundlePath: 'packages/client/ui-workspace/lib/client.js',
    url: '/plugins/ui-workspace.js',
    rev: 'fx',
    inject: [
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-sidebar',
    ],
  },
  { id: '@deepseek-ai/dsh-session-log-export', bundlePath: 'packages/session-query/session-log-export/lib/client.js', url: '/plugins/session-log-download.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-ui-commands', '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-trajectory'] },
  { id: '@deepseek-ai/dsh-client-ui-trajectory', bundlePath: 'packages/client/ui-trajectory/lib/client.js', url: '/plugins/ui-trajectory.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-ui-conversation'] },
]

const bundles = new Map(PLUGINS.map(plugin => [
  plugin.url,
  readFileSync(join(process.cwd(), plugin.bundlePath), 'utf8'),
]))

interface FixtureWindow extends Window {
  __DSH_BOOT__?: { rev: string; entries: WebBootEntry[] }
  __ModuleLoader__?: unknown
}

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

class MemoryIdbRequest {
  result: unknown
  error: DOMException | null = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
  onupgradeneeded: (() => void) | null = null
}

class MemoryObjectStore {
  constructor(
    readonly keyPath: string,
    readonly rows = new Map<string, unknown>(),
  ) {}

  put(record: Record<string, unknown>): MemoryIdbRequest {
    const key = record[this.keyPath]
    if (typeof key !== 'string') throw new Error('indexedDB put: keyPath is not a string')
    this.rows.set(key, record)
    return new MemoryIdbRequest()
  }

  get(key: string): MemoryIdbRequest {
    const request = new MemoryIdbRequest()
    queueMicrotask(() => {
      request.result = this.rows.get(key)
      request.onsuccess?.()
    })
    return request
  }

  delete(key: string): MemoryIdbRequest {
    this.rows.delete(key)
    return new MemoryIdbRequest()
  }
}

class MemoryTransaction {
  error: DOMException | null = null
  oncomplete: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(private readonly store: MemoryObjectStore) {
    queueMicrotask(() => { this.oncomplete?.() })
  }

  objectStore(_name: string): MemoryObjectStore {
    return this.store
  }
}

class MemoryDatabase {
  readonly objectStoreNames = {
    contains: (name: string): boolean => this.stores.has(name),
  }

  constructor(
    readonly name: string,
    public version: number,
    readonly stores = new Map<string, MemoryObjectStore>(),
  ) {}

  createObjectStore(name: string, options: { keyPath: string }): MemoryObjectStore {
    const store = new MemoryObjectStore(options.keyPath)
    this.stores.set(name, store)
    return store
  }

  transaction(name: string, _mode: IDBTransactionMode): MemoryTransaction {
    const store = this.stores.get(name)
    if (store === undefined) throw new Error(`indexedDB transaction: missing store ${name}`)
    return new MemoryTransaction(store)
  }

  close(): void {}
}

/** jsdom has no IndexedDB; Composer persist (`putStagedImage`) opens one after paste. */
class MemoryIndexedDB {
  readonly #dbs = new Map<string, MemoryDatabase>()

  open(name: string, version = 1): MemoryIdbRequest {
    const request = new MemoryIdbRequest()
    queueMicrotask(() => {
      let db = this.#dbs.get(name)
      const upgrade = db === undefined || db.version < version
      if (db === undefined) {
        db = new MemoryDatabase(name, version)
        this.#dbs.set(name, db)
      } else if (db.version < version) {
        db.version = version
      }
      request.result = db
      if (upgrade) request.onupgradeneeded?.()
      request.onsuccess?.()
    })
    return request
  }
}

const win = window as FixtureWindow
let unmount: (() => void) | undefined

// File-scoped: `void putStagedImage` can open the database after afterEach
// has already run `vi.unstubAllGlobals()`.
Object.defineProperty(globalThis, 'indexedDB', {
  configurable: true,
  value: new MemoryIndexedDB(),
})

/**
 * Register the per-test jsdom setup and teardown the assembled boot needs:
 * English pinned before boot so role/text locators stay deterministic across
 * localized component migrations (the newEnglishPage e2e convention), the
 * observers and frame callbacks jsdom lacks, and a full reset of the document,
 * the boot globals, and the injected plugin styles afterwards.
 */
export function installAssembledBootEnv(): void {
  beforeEach(() => {
    localStorage.clear()
    // The locale service derives its provisional locale from the browser and
    // takes an explicit choice only from Host settings, which this lane's
    // fixture transport does not serve; pinning the navigator is what selects
    // English here.
    Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true })
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true })
    document.title = 'DeepSeek Harness'
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => { callback(0) }, 0) as unknown as number)
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { clearTimeout(id) })
  })

  afterEach(() => {
    act(() => { unmount?.() })
    unmount = undefined
    cleanup()
    delete win.__DSH_BOOT__
    delete win.__ModuleLoader__
    document.body.innerHTML = ''
    document.head.querySelectorAll('style[data-plugin]').forEach((style) => { style.remove() })
    document.title = ''
    history.replaceState(null, '', '/')
    // Deleting the own properties uncovers jsdom's own accessors again
    // (Navigator declares both readonly, hence the erased receiver).
    const ownNavigator = navigator as unknown as Record<string, unknown>
    delete ownNavigator.languages
    delete ownNavigator.language
    vi.unstubAllGlobals()
  })
}

/**
 * Mount the assembled application on the fixture transport; the teardown
 * registered by installAssembledBootEnv disposes it.
 */
export function mountAssembledApp(): void {
  history.replaceState(null, '', '/?fixture')
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  win.__DSH_BOOT__ = { rev: 'fx', entries: PLUGINS.map(({ bundlePath: _bundlePath, ...plugin }) => plugin) }
  act(() => {
    const entry = new AppWebEntry(root, {
      loadBundle: async (url) => {
        const code = bundles.get(url)
        if (code === undefined) throw new Error(`missing built bundle ${url}`)
        ;(0, eval)(code)
      },
    })
    void entry.run()
    unmount = () => { entry.dispose() }
  })
}

/**
 * Match a CSS-module class by its logical name.
 * Module class names carry a per-build hash in one of two schemes —
 * ui-primitives emits `_<name>_<hash>` (name bounded by underscores),
 * feature bundles emit `<hash>_<name>` (name at the end) — and a longer name
 * containing this one must not match (`line` must not hit `lineNumber`).
 * @param el - element whose class list is inspected.
 * @param name - logical (unhashed) module class name.
 * @returns whether the element carries that module class.
 */
export function hasClass(el: Element, name: string): boolean {
  return [...el.classList].some(cls => cls === name || cls.endsWith(`_${name}`) || cls.startsWith(`_${name}_`) || cls.includes(`_${name}_`))
}

/**
 * Whether this run rewrites its golden instead of comparing against it, set by
 * the snapshot gate's `DSH_SNAPSHOT` mode (`record` re-runs the scenarios from
 * scratch, `refresh` re-derives the expected text from the existing ones).
 */
export const REFRESHING_GOLDEN = process.env.DSH_SNAPSHOT === 'record' || process.env.DSH_SNAPSHOT === 'refresh'
