/** Slot and tab-payload contracts for file viewers hosted by the official Sidebar. */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { WorkspaceFileParams } from '@deepseek-ai/dsh-api-workspace-files/client'
import type { EditorToolbarControls, EditorToolbarState } from '../service.ts'
import type { SessionScope } from '../api.ts'
import type { RetainedEditorState } from '../TextEditor.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Persistent presentation owned by one official file occurrence. */
export type OfficialFileTabPayload = {
  readonly treeOpen?: boolean
  readonly treeWidth?: number
  readonly dir?: boolean
}

/** Data and capabilities delivered to one keyed file viewer body. */
export interface OfficialFileViewerOwnerProps {
  readonly address: string
  readonly scope: SessionScope
  readonly path: string
  readonly title: string
  readonly viewerId: string
  readonly content?: string
  readonly truncated?: boolean
  readonly mediaUrl?: string
  readonly customData?: JsonValue | Uint8Array
  readonly line?: number
  readonly navigationRevision: number
  readonly toolbar: 'host'
  readonly onToolbarState: (state: EditorToolbarState) => void
  readonly onToolbarControls: (controls: EditorToolbarControls | null) => void
  readonly writeFile: (content: string) => Promise<void>
  readonly insertIntoConversation: (text: string) => void
  readonly htmlSafety: { readonly forceUnsandboxed: boolean; readonly defaultUnsandboxed: boolean }
  readonly retained?: RetainedEditorState
  readonly onRetain: (state: RetainedEditorState) => void
  readonly onDirtyChange: (dirty: boolean) => void
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightResourceParamsMap {
    /** Line and tree-reveal navigation supported by the rich file host. */
    file: WorkspaceFileParams
  }

  interface SidebarRightTabPayloadMap {
    /** Durable view preferences of the built-in official file tab. */
    file: OfficialFileTabPayload
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Better file viewer, editor, and tree copy. */
    betterSidebar: import('../locales.ts').CopyKey
  }

  interface SlotMap {
    /** File body selected by the viewer registry; the descriptor contains no UI producer. */
    'sidebar.right.file.viewer': {
      kind: 'keyed'
      scope: 'session'
      owner: OfficialFileViewerOwnerProps
    }
  }
}
