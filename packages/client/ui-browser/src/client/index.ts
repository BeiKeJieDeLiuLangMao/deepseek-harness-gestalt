/**
 * Browser Dock plugin, browser half: the expanded Dock occupies `details`
 * while this Session owns tabs and `dockOpen` is true; the collapsed layered
 * preview occupies `conversation.browser.preview` otherwise. Live Workspace
 * facts arrive through `useProjection('browserWorkspace')`. Mutations go
 * through the generated Browser Workspace Remote API.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-browser-workspace/client'
import { BrowserDock } from './BrowserDock.tsx'
import { BrowserPreview } from './BrowserPreview.tsx'
import { BROWSER_DOCK_WIDTH_RANGE } from './model.ts'
import { en, NS, zh, type BrowserKey } from './locales.ts'
import { unwrapRemote, type BrowserDockActions, type BrowserPreviewActions } from './slots.ts'

export type { BrowserDockActions, BrowserPreviewActions } from './slots.ts'
export { unwrapRemote } from './slots.ts'
export type { BrowserKey } from './locales.ts'
export { BROWSER_DOCK_WIDTH_RANGE } from './model.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Browser Dock and collapsed preview copy. */
    browser: BrowserKey
  }
}

/** Required services for Dock occupancy, preview, Remote mutations, layout, and copy. */
export const inject = [
  'slots', 'sessions', 'remote', 'remote.browserWorkspace', 'layout', 'locale',
]

/**
 * Client plugin body: expanded Dock and collapsed preview entries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-browser: dictionaries')

  ctx.slots.inject('details', () => ctx.slots.register({
    name: 'details',
    id: 'browser',
    order: 10,
    locale: NS,
    inject: (sessionId: SessionId): BrowserDockActions & {
      openDetails: () => void
      setDetailsWidth: (px: number) => void
      closeDetails: () => void
    } => ({
      setDock: (open, width) => unwrapRemote(ctx.remote.browserWorkspace.setDock(sessionId, {
        open,
        ...width === undefined ? {} : { width },
      })),
      focus: (target, expectedRevision) =>
        unwrapRemote(ctx.remote.browserWorkspace.focus(sessionId, target, expectedRevision)),
      refresh: (target, expectedRevision, url) =>
        unwrapRemote(ctx.remote.browserWorkspace.navigate(sessionId, target, expectedRevision, url)),
      observe: target => unwrapRemote(ctx.remote.browserWorkspace.observe(sessionId, target)),
      screenshot: target => unwrapRemote(ctx.remote.browserWorkspace.screenshot(sessionId, target)),
      takeover: (target, expectedRevision) =>
        unwrapRemote(ctx.remote.browserWorkspace.takeover(sessionId, target, expectedRevision)),
      returnControl: (target, expectedRevision) =>
        unwrapRemote(ctx.remote.browserWorkspace.returnControl(sessionId, target, expectedRevision)),
      close: (target, expectedRevision) =>
        unwrapRemote(ctx.remote.browserWorkspace.close(sessionId, target, expectedRevision)),
      openDetails: () => { ctx.layout.openDetails(BROWSER_DOCK_WIDTH_RANGE) },
      setDetailsWidth: (px) => { ctx.layout.setDetails(px) },
      closeDetails: () => { ctx.layout.closeDetails() },
    }),
  }, BrowserDock))

  ctx.slots.inject('conversation.browser.preview', () => ctx.slots.register({
    name: 'conversation.browser.preview',
    locale: NS,
    inject: (sessionId: SessionId): BrowserPreviewActions => ({
      openDock: () => unwrapRemote(ctx.remote.browserWorkspace.setDock(sessionId, { open: true })),
      focus: (target, expectedRevision) =>
        unwrapRemote(ctx.remote.browserWorkspace.focus(sessionId, target, expectedRevision)),
      observe: target => unwrapRemote(ctx.remote.browserWorkspace.observe(sessionId, target)),
      screenshot: target => unwrapRemote(ctx.remote.browserWorkspace.screenshot(sessionId, target)),
    }),
  }, BrowserPreview))
}
