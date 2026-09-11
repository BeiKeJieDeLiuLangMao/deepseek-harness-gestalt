/** Register Better workbench capabilities on the official Sidebar. */
import type { SidebarContext } from '../context-types.ts'
import { loadChunk, revalidateChunksOnReactivate, setChunkModuleSystem } from './chunk-loader.ts'
import { registerImeGuard } from './ime-guard.ts'
import { installSidechatAdmission } from './sidechat-admission.ts'
import { registerSettingsNavIcon } from './settings-nav-icon.ts'
import {
  OFFICIAL_BROWSER_INJECT,
  openOfficialBrowserUrl,
  registerOfficialBrowser,
} from './official-browser/index.tsx'
import {
  OFFICIAL_CHANGES_TASKS_INJECT,
  registerOfficialChangesTasks,
} from './official-changes-tasks.tsx'
import { registerOfficialFiles } from './official-files/index.ts'
import {
  OFFICIAL_OPEN_ROUTING_INJECT,
  registerOfficialOpenRouting,
} from './official-open-routing.tsx'
import { OFFICIAL_RUNTIME_INJECT, registerOfficialRuntimeTabs } from './official-runtime/index.ts'
import { OFFICIAL_SETTINGS_INJECT, registerOfficialSidebarSettings } from './official-settings.ts'
import { LOCALE_NS, attachLocale, attachBetterLocale, t, zh, en } from './locales.ts'

const officialInject = [...new Set([
  ...OFFICIAL_RUNTIME_INJECT,
  ...OFFICIAL_CHANGES_TASKS_INJECT,
  ...OFFICIAL_BROWSER_INJECT,
  ...OFFICIAL_OPEN_ROUTING_INJECT,
  ...OFFICIAL_SETTINGS_INJECT,
])]

/** Services required by the official workbench contributions and lazy bodies. */
export const inject = [
  'connection', 'remote', 'locale', 'modules', ...officialInject,
]

function isDesktopOverlayDocument(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.hasAttribute('data-dsh-desktop-overlay')) {
    return true
  }
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search.replace(/^\?/, '')).get('dsh-desktop-overlay') === '1'
}

/** Register the official file, runtime, activity, and settings adapters. */
export function apply(ctx: SidebarContext): void {
  const interactive = !isDesktopOverlayDocument()
  setChunkModuleSystem(ctx.modules)
  void revalidateChunksOnReactivate()

  attachLocale(ctx.locale)
  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', zh)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', en)
    return () => { offZh(); offEn() }
  }, 'dsh-better-sidebar: dictionaries')

  ctx.effect(() => {
    let dispose: (() => void) | undefined
    let generation = 0
    const sync = (): void => {
      generation += 1
      dispose?.()
      dispose = undefined
      const store = ctx.get('betterLocale') as
        | {
            readonly active: string | undefined
            getOverride(dshActive: string, ns: string, key: string): string | undefined
            isOverrideActive(dshActive: string): boolean
            register(ns: string, dicts: Record<string, Record<string, string>>): () => void
            subscribe(listener: () => void): () => void
          }
        | undefined
      attachBetterLocale(store)
      if (store === undefined) return
      const ownGeneration = generation
      void loadChunk('locale')
        .then((module) => {
          if (ownGeneration === generation) {
            dispose = store.register(LOCALE_NS, module.localeDicts as Record<string, Record<string, string>>)
          }
        })
        .catch(() => { /* The built-in Chinese and English dictionaries remain active. */ })
    }
    sync()
    const unsubscribe = ctx.locale.subscribe(sync)
    return () => {
      generation += 1
      unsubscribe()
      dispose?.()
      attachBetterLocale(undefined)
    }
  }, 'dsh-better-sidebar: better-locale lazy integration')

  ctx.effect(registerImeGuard, 'dsh-better-sidebar: IME composition guard')
  if (interactive) {
    ctx.effect(
      () => installSidechatAdmission(ctx),
      'dsh-better-sidebar: Side Chat Session admission',
    )
  }

  registerOfficialFiles(ctx)
  ctx.effect(
    () => registerOfficialRuntimeTabs(ctx, { subscribe: interactive }),
    'dsh-better-sidebar: official Side Chat and Terminal runtimes',
  )
  ctx.effect(
    () => registerOfficialChangesTasks(ctx, { subscribe: interactive }),
    'dsh-better-sidebar: official Changes and Tasks tabs',
  )
  ctx.effect(
    () => registerOfficialBrowser(ctx, { interceptLinks: interactive }),
    'dsh-better-sidebar: official Browser fallback and link routing',
  )
  if (interactive) {
    ctx.effect(
      () => registerOfficialOpenRouting(ctx, {
        openUrl: async (sessionId, href, title) => {
          await openOfficialBrowserUrl(ctx.sidebarRight, ctx.sidebarRightTabs, sessionId, href, title)
        },
      }),
      'dsh-better-sidebar: official file and Host open routing',
    )
  }
  ctx.effect(
    () => registerOfficialSidebarSettings(ctx),
    'dsh-better-sidebar: official settings',
  )
  ctx.effect(
    () => registerSettingsNavIcon(() => t('settingsNav')),
    'dsh-better-sidebar: settings navigation icon',
  )
}
