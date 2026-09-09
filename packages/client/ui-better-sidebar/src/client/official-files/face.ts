/** Business capabilities injected into the official file body. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {
  SidebarRightPreferencesSnapshot,
  SidebarRightViewerDefinition,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { api } from '../api.ts'
import { appendToDraft, insertFileReference } from '../conversation-draft.ts'
import { relativeTo } from '../paths.ts'
import type { RetainedEditorState } from '../TextEditor.tsx'
import { officialFileAddress, parseOfficialFileAddress } from './address.ts'
import type { OfficialFileTabPayload } from './contract.ts'
import { OFFICIAL_FILE_KIND } from './definitions.ts'
import type { OfficialFileRuntime } from './runtime.ts'
import type { createOfficialFilesStore } from './store.ts'

/** Component-side face for navigation, settings, mutation reconciliation, and editor retention. */
export interface OfficialFileInjected {
  readonly hooks: {
    readonly filePreferences: HostObservable<SidebarRightPreferencesSnapshot>
    readonly fileViewers: HostObservable<readonly SidebarRightViewerDefinition[]>
  }
  readonly start: (tabId: TabId, root: string, signal: AbortSignal) => void
  readonly toggle: (tabId: TabId, path: string) => void
  readonly split: (paneId: PaneId) => PaneId | undefined
  readonly matchViewer: (address: string, path: string, head?: Uint8Array) => SidebarRightViewerDefinition | undefined
  readonly viewerSettings: (viewerId: string) => Readonly<Record<string, JsonValue>>
  readonly htmlSafety: () => { readonly forceUnsandboxed: boolean; readonly defaultUnsandboxed: boolean }
  readonly setOpenWith: (value: JsonValue) => Promise<void>
  readonly disableWorkspaceFence: () => Promise<void>
  readonly writeFile: (homeSessionId: SessionId, cwd: string | undefined, path: string, content: string) => Promise<void>
  readonly openExternal: typeof api.openExternal
  readonly reference: (homeSessionId: SessionId, path: string, isDir: boolean, cwd: string | undefined) => void
  readonly insertText: (homeSessionId: SessionId, text: string) => void
  readonly renamed: (homeSessionId: SessionId, oldPath: string, newPath: string, cwd: string | undefined) => void
  readonly removed: (homeSessionId: SessionId, path: string, cwd: string | undefined) => void
  readonly armEditor: (homeSessionId: SessionId, tabId: TabId, signal: AbortSignal) => void
  readonly retainedEditor: (homeSessionId: SessionId, tabId: TabId) => RetainedEditorState | undefined
  readonly retainEditor: (homeSessionId: SessionId, tabId: TabId, state: RetainedEditorState) => void
  readonly setDirty: (homeSessionId: SessionId, tabId: TabId, dirty: boolean) => void
}

function pathUnder(path: string, root: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)
}

/** Build the session-bound Slot inject factory for the official file body. */
export function officialFileFace(
  ctx: ClientContext,
  runtime: OfficialFileRuntime,
): (sessionId: SessionId, actions: BoundActions<ReturnType<typeof createOfficialFilesStore>>) => OfficialFileInjected {
  const filePreferences: HostObservable<SidebarRightPreferencesSnapshot> = ctx.sidebarRightPreferences
  const fileViewers: HostObservable<readonly SidebarRightViewerDefinition[]> = {
    getSnapshot: () => ctx.sidebarRightTabs.viewers(),
    subscribe: listener => ctx.sidebarRightTabs.subscribe(listener),
  }
  return (_renderSessionId, actions) => {
    const absolutePath = (homeSessionId: SessionId, address: string, cwd: string | undefined): string | undefined => {
      const parsed = parseOfficialFileAddress(address)
      if (parsed === undefined) return undefined
      if (parsed.scope === 'absolute') return parsed.path
      if (parsed.sessionId !== homeSessionId) return undefined
      if (cwd === undefined || cwd === '') return parsed.path
      const separator = cwd.includes('\\') ? '\\' : '/'
      return `${cwd.replace(/[\\/]+$/, '')}${separator}${parsed.path}`
    }
    const reconcile = (homeSessionId: SessionId, oldPath: string, newPath: string | undefined, cwd: string | undefined): void => {
      const navigator = ctx.sidebarRight.forSession(homeSessionId)
      const session = ctx.sidebarRight.getSnapshot().sessions.find(entry => entry.sessionId === homeSessionId)
      if (session === undefined) return
      for (const occurrence of session.tabs) {
        if (occurrence.record.kind !== OFFICIAL_FILE_KIND) continue
        const current = absolutePath(homeSessionId, occurrence.record.contentId, cwd)
        if (current === undefined || !pathUnder(current, oldPath)) continue
        if (newPath === undefined) {
          void navigator.close(occurrence.record.id)
          continue
        }
        const target = `${newPath}${current.slice(oldPath.length)}`
        void navigator.openResource(officialFileAddress(homeSessionId, cwd, target), {
          replaceTab: occurrence.record.id,
          payload: occurrence.state.payload as OfficialFileTabPayload | undefined,
        })
      }
    }
    return {
      hooks: { filePreferences, fileViewers },
      start(tabId, root, signal) {
        actions.start(tabId, root)
        signal.addEventListener('abort', () => { actions.forget(tabId) }, { once: true })
      },
      toggle: (tabId, path) => { actions.toggle(tabId, path) },
      split: paneId => ctx.sidebarRight.split(paneId),
      matchViewer: (address, path, head) => ctx.sidebarRightTabs.matchViewer({ address, path, head }),
      viewerSettings: viewerId => ctx.sidebarRightPreferences.pluginSettings(viewerId),
      htmlSafety: () => ctx.sidebarRightPreferences.htmlViewerSafety(),
      setOpenWith: value => ctx.sidebarRightPreferences.setPluginSetting('editor', 'openWith', value),
      disableWorkspaceFence: () => ctx.sidebarRightPreferences.update({ workspaceFence: false }),
      writeFile: (homeSessionId, cwd, path, content) => api.fsWrite({
        sessionId: homeSessionId,
        ...(cwd === undefined ? {} : { cwd }),
      }, path, content).then(() => undefined),
      openExternal: api.openExternal,
      reference(homeSessionId, path, isDir, cwd) {
        const relative = cwd === undefined ? path : relativeTo(cwd, path)
        if (!isDir && insertFileReference(ctx as never, homeSessionId, relative)) return
        appendToDraft(ctx as never, homeSessionId, `@${relative}${isDir && !relative.endsWith('/') ? '/' : ''}`)
      },
      insertText: (homeSessionId, text) => { appendToDraft(ctx as never, homeSessionId, text) },
      renamed(homeSessionId, oldPath, newPath, cwd) {
        actions.rename(oldPath, newPath)
        reconcile(homeSessionId, oldPath, newPath, cwd)
      },
      removed(homeSessionId, path, cwd) {
        actions.remove(path)
        reconcile(homeSessionId, path, undefined, cwd)
      },
      armEditor: (homeSessionId, tabId, signal) => { runtime.arm(homeSessionId, tabId, signal) },
      retainedEditor: (homeSessionId, tabId) => runtime.editor(homeSessionId, tabId),
      retainEditor: (homeSessionId, tabId, state) => { runtime.retain(homeSessionId, tabId, state) },
      setDirty: (homeSessionId, tabId, dirty) => { runtime.setDirty(homeSessionId, tabId, dirty) },
    }
  }
}
