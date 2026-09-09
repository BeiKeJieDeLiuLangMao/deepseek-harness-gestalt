/** View state retained for official file occurrences while their bodies unmount. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

/** Tree state owned by one file occurrence. */
export interface OfficialFileTabState {
  expanded: string[]
  revealed: string[]
}

/** File occurrence state in one Session. */
export interface OfficialFilesState {
  byTab: Record<TabId, OfficialFileTabState>
}

type OfficialFilesActions = {
  start: (draft: OfficialFilesState, tabId: TabId, root: string) => void
  toggle: (draft: OfficialFilesState, tabId: TabId, path: string) => void
  reveal: (draft: OfficialFilesState, tabId: TabId, paths: readonly string[]) => void
  rename: (draft: OfficialFilesState, oldPath: string, newPath: string) => void
  remove: (draft: OfficialFilesState, path: string) => void
  forget: (draft: OfficialFilesState, tabId: TabId) => void
}

function pathUnder(path: string, root: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)
}

/** Declare the official file tab's per-Session view store. */
export function createOfficialFilesStore(): EngineStoreHandle<OfficialFilesState, OfficialFilesActions> {
  return defineStore({
    init: (): OfficialFilesState => ({ byTab: {} }),
    actions: {
      start: (draft, tabId, root) => {
        draft.byTab[tabId] ??= { expanded: [root], revealed: [] }
      },
      toggle: (draft, tabId, path) => {
        const state = draft.byTab[tabId]
        if (state === undefined) return
        const index = state.expanded.indexOf(path)
        if (index < 0) state.expanded.push(path)
        else state.expanded.splice(index, 1)
      },
      reveal: (draft, tabId, paths) => {
        const state = draft.byTab[tabId]
        if (state === undefined) return
        state.revealed = [...paths]
        for (const path of paths.slice(0, -1)) {
          if (!state.expanded.includes(path)) state.expanded.push(path)
        }
      },
      rename: (draft, oldPath, newPath) => {
        for (const state of Object.values(draft.byTab)) {
          state.expanded = state.expanded.map(path => pathUnder(path, oldPath)
            ? `${newPath}${path.slice(oldPath.length)}` : path)
          state.revealed = state.revealed.map(path => pathUnder(path, oldPath)
            ? `${newPath}${path.slice(oldPath.length)}` : path)
        }
      },
      remove: (draft, path) => {
        for (const state of Object.values(draft.byTab)) {
          state.expanded = state.expanded.filter(entry => !pathUnder(entry, path))
          state.revealed = state.revealed.filter(entry => !pathUnder(entry, path))
        }
      },
      forget: (draft, tabId) => { delete draft.byTab[tabId] },
    },
  })
}
