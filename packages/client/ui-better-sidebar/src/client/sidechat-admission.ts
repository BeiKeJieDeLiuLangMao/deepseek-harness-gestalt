/**
 * Side Chat Session admission adapter for ClientSessions.
 * Draft registry and Host-published Side Chat ids authorize the match;
 * titles and ordinary subagent rows do not. Host sidechat routes remain
 * the authority for start, prompt, cancel, queue, and model selection.
 */
import type { SessionAdmissionAdapter } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ModelSelection, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { SidebarContext } from '../context-types.ts'
import {
  api, isKnownSidechatSession, noteSidechatDraftSelection, settleSidechatDraft, SidebarApiError,
  sidechatDraftOf,
} from './api.ts'

/**
 * Register the Side Chat admission adapter on ClientSessions.
 * `apply` installs this as an effect; tests call it without mounting the panel.
 * @param ctx - sidebar Client context whose `sessions` is ClientSessions.
 * @returns token-checked disposer from `registerAdmissionAdapter`.
 */
export function installSidechatAdmission(ctx: SidebarContext): () => void {
  return ctx.sessions.registerAdmissionAdapter(createSidechatAdmission(ctx))
}

function createSidechatAdmission(ctx: SidebarContext): SessionAdmissionAdapter {
  return {
    id: 'better-sidebar-sidechat',
    handles: sessionId => isKnownSidechatSession(sessionId),
    historyScope: 'owned-suffix',
    skillCatalogSessionId: sessionId => sidechatDraftOf(sessionId)?.parentSessionId ?? sessionId,
    prompt: async (sessionId, content, mode, signal) => {
      if (content.some(part => part.type !== 'text')) {
        return {
          ok: false,
          error: {
            code: 'session/attachment-invalid',
            message: 'Image input is unavailable in Side Chat.',
            details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
          },
        }
      }
      const text = content
        .map(part => (part as Extract<typeof part, { readonly type: 'text' }>).text)
        .join('\n\n')
      const draft = sidechatDraftOf(sessionId)
      if (draft === undefined) {
        await api.sidechatPrompt(sessionId, text, mode, signal)
      } else {
        await api.sidechatStart(
          draft.parentSessionId,
          sessionId,
          text,
          draft.selection,
          signal,
        )
        settleSidechatDraft(sessionId)
      }
      return { ok: true, value: { accepted: true } }
    },
    cancel: async (sessionId) => {
      if (sidechatDraftOf(sessionId) !== undefined) return { ok: true, value: { accepted: true } }
      await api.sidechatCancel(sessionId)
      return { ok: true, value: { accepted: true } }
    },
    updateQueue: async (sessionId, itemId, action) => {
      try {
        await api.sidechatUpdateQueue(sessionId, itemId, action)
        return { ok: true, value: { accepted: true } }
      } catch (cause) {
        if (cause instanceof SidebarApiError && cause.code === 'queue-item-not-found') {
          return {
            ok: false,
            error: { code: 'session/queue-item-not-found', message: cause.message, details: { itemId } },
          }
        }
        if (cause instanceof SidebarApiError && cause.code === 'steer-unavailable') {
          return {
            ok: false,
            error: { code: 'session/steer-unavailable', message: cause.message, details: { itemId } },
          }
        }
        throw cause
      }
    },
    command: async (sessionId, line) => {
      const match = /^\/permission\s+(\S+)\s*$/u.exec(line)
      const preset = match?.[1]
      if (preset === undefined) return { ok: true, value: { matched: false } }
      const draft = sidechatDraftOf(sessionId)
      const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
      const parentSessionId = draft?.parentSessionId ?? summary?.parentId
      if (parentSessionId === undefined) throw new Error(`Side Chat session "${sessionId}" has no parent`)
      if (draft !== undefined) {
        const result = await ctx.remote.commands.execute(parentSessionId, line, [])
        if (result.ok === false) {
          return {
            ok: false,
            error: {
              code: 'gateway/internal',
              message: result.error.message,
              details: {},
            },
          }
        }
        return { ok: true, value: { matched: result.value !== undefined } }
      }
      await api.sidechatPermission(sessionId, parentSessionId as SessionId, preset)
      return { ok: true, value: { matched: true } }
    },
    modelRoute: (sessionId) => {
      return {
        selectModel: async (selection: ModelSelection, signal) => {
          const provisional = sidechatDraftOf(sessionId) !== undefined
          const result = await api.sidechatSelectModel(sessionId, selection, provisional, signal)
          noteSidechatDraftSelection(sessionId, result.selected)
          return { ok: true, value: result }
        },
      }
    },
  }
}
