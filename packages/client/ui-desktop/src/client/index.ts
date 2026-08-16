/**
 * Desktop-only Session Surface chrome: GESTALT wordmark, drag strip, Update Control.
 * Mounted only through the Desktop `--patch` overlay.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BrandSeat } from './BrandSeat.tsx'
import { DragStrip } from './DragStrip.tsx'
import { UpdateControl } from './UpdateControl.tsx'
import { createUpdaterSource } from './status-source.ts'
import { en, zh, type DesktopKey } from './locales.ts'

export type { DesktopBridge, UpdaterPhase, UpdaterStatus } from '../protocol.ts'
export type { DesktopKey } from './locales.ts'
export type { UpdateControlProps } from './UpdateControl.tsx'
export { createUpdaterSource, INITIAL_UPDATER_STATUS } from './status-source.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop chrome copy. */
    desktop: DesktopKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'desktop'

/** Required services: slots plus desktop copy. */
export const inject = ['slots', 'locale']

/**
 * Register Desktop chrome into sidebar holes declared by ui-sidebar.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-desktop: dictionaries')

  const updater = createUpdaterSource()
  /* v8 ignore next -- the client half always has window */
  const desktop = typeof window === 'undefined' ? undefined : window.dshDesktop
  if (desktop !== undefined) {
    void desktop.getStatus().then((status) => { updater.set(status) })
    ctx.effect(() => desktop.onStatus((status) => { updater.set(status) }), 'ui-desktop: updater status')
    void desktop.getFullscreen().then((on) => { applyFullscreen(on) })
    ctx.effect(() => desktop.onFullscreen(applyFullscreen), 'ui-desktop: fullscreen')
  }

  ctx.slots.inject('sidebar.brand', () => ctx.slots.register(
    { name: 'sidebar.brand', select: () => ({}), locale: NS },
    BrandSeat,
  ))
  ctx.slots.inject('sidebar.chrome.drag', () => ctx.slots.register(
    { name: 'sidebar.chrome.drag', id: 'desktop-drag', locale: NS },
    DragStrip,
  ))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    {
      name: 'sidebar.footer.action',
      id: 'desktop-update',
      locale: NS,
      inject: () => ({ hooks: { updater } }),
    },
    UpdateControl,
  ))
}

function applyFullscreen(on: boolean): void {
  document.documentElement.toggleAttribute('data-dsh-fullscreen', on)
}
