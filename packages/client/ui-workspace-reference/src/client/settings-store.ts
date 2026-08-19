/**
 * Settings and dock store: a mirror of the durable Workspace Reference
 * section. The plugin apply-world listener is the only writer.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import {
  DEFAULT_WORKSPACE_REFERENCE_SETTINGS,
  type WorkspaceReferenceSettings,
} from '../settings.ts'

/** Declared action shape giving the exported factory a stable return type. */
type WorkspaceReferenceActions = {
  sync: (draft: WorkspaceReferenceSettings, next: WorkspaceReferenceSettings) => void
}

/**
 * Declares the Workspace Reference settings state.
 * @returns the store handle.
 */
export function createWorkspaceReferenceStore(): EngineStoreHandle<
  WorkspaceReferenceSettings,
  WorkspaceReferenceActions
> {
  return defineStore({
    init: (): WorkspaceReferenceSettings => ({ ...DEFAULT_WORKSPACE_REFERENCE_SETTINGS }),
    actions: {
      sync: (draft, next) => {
        draft.enable = next.enable
        draft.pasteIgnore = next.pasteIgnore
        draft.exact = next.exact
        draft.regex = next.regex
      },
    },
  })
}
