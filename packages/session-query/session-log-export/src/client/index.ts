/** Browser plugin owning Session export download state and its shared modal. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import { SessionLogDownloadController } from './controller.ts'
import type { SessionLogDownloadDialogInjected } from './Dialog.tsx'
import { SessionLogDownloadDialog } from './Dialog.tsx'
import { SessionLogDownloadToolbarAction } from './ToolbarAction.tsx'
import { en, NS, zh, type SessionLogDownloadKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionLogDownload: SessionLogDownloadController
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-log-download': SessionLogDownloadKey
  }
}

export type { SessionLogDownloadEntry, SessionLogDownloadState } from './controller.ts'

export const inject = ['slots', 'locale']

function downloadInject(controller: SessionLogDownloadController): SessionLogDownloadDialogInjected {
  return {
    hooks: { sessionLogDownload: controller.store },
    request: (sessionId: SessionId) => controller.download(sessionId),
    dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
  }
}

/**
 * Provide the download controller, mount the shared modal in the Session Header,
 * and wait for Trajectory's toolbar hole for the visible Session-log button.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  const controller = new SessionLogDownloadController()
  ctx.provide('sessionLogDownload', controller)
  ctx.effect(() => async () => { await controller.dispose() }, 'session-log-download: browser download lifecycle')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-log-download: browser dictionaries')
  ctx.on('command/executed', (sessionId, commandName, result) => {
    if (commandName === 'export' && result.kind === 'success') void controller.download(sessionId)
  })
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'session-log-download-dialog',
    locale: NS,
    inject: () => downloadInject(controller),
  }, SessionLogDownloadDialog))
  ctx.slots.inject('conversation.trajectory.toolbar.utilities', () => ctx.slots.register({
    name: 'conversation.trajectory.toolbar.utilities',
    id: 'session-log-download',
    locale: NS,
    inject: () => downloadInject(controller),
  }, SessionLogDownloadToolbarAction))
}

export type { SessionLogDownloadDialogInjected, SessionLogDownloadDialogProps } from './Dialog.tsx'
