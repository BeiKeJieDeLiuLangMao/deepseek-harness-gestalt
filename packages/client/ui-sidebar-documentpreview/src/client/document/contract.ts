/** Document renderer slot: the owner supplies shared file state, renderers own their presentation. */
import type { PropsRuntime, SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { DocumentEditorState } from './editor.ts'

/** One loaded text window, retaining source line positions. */
export interface DocumentTextPage {
  readonly offset: number
  readonly text: string
  readonly lines: number
}

/**
 * Contents prepared by the preview owner using ordinary file reads.
 * Byte arrays are transient UI input, never persisted layout or Session data.
 */
export type DocumentContent =
  | { readonly kind: 'text'; readonly text: string; readonly pages: readonly DocumentTextPage[]; readonly eof: boolean }
  | { readonly kind: 'bytes'; readonly data: Uint8Array<ArrayBuffer> }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Document body selected by a registered implementation id. */
    'sidebar.right.tab.document': {
      kind: 'keyed'
      scope: 'session'
      owner: {
        /** Original file address, also readable through the standard useResource hook. */
        readonly resourceAddress: string
        /** Loaded content; text is an accumulated prefix until eof. */
        readonly content: DocumentContent
        /** The document toolbar's current wrapping preference. */
        readonly wrap: boolean
      }
      hookContext: UseSidebarRightTabInfo
      inject: {
        hooks: {
          tabInfo: SlotHookFactory<'sidebar.right.tab.document', UseSidebarRightTabInfo>
        }
      }
    }
    /** Optional renderer-specific source editor controlled by the official document owner. */
    'sidebar.right.tab.document.editor': {
      kind: 'keyed'
      scope: 'session'
      owner: {
        /** Selected official document renderer id, also the keyed editor dispatch identity. */
        readonly documentId: string
        /** Original file address naming the Session and path. */
        readonly resourceAddress: string
        /** Byte-exact UTF-8 text from the official bounded complete-file read. */
        readonly content: { readonly text: string; readonly version: string }
        /** Current wrap preference. */
        readonly wrap: boolean
        /** State retained for this tab occurrence while the editor is unmounted. */
        readonly retained: DocumentEditorState | undefined
        /** Retain editor state outside persisted layout and Session data. */
        readonly retain: (state: DocumentEditorState) => void
        /** Update close admission without copying the draft on every keystroke. */
        readonly setDirty: (dirty: boolean) => void
        /** Notify the owner after a successful write so it rereads through ordinary paging. */
        readonly saved: () => void
      }
      hookContext: UseSidebarRightTabInfo
      inject: {
        hooks: {
          tabInfo: SlotHookFactory<'sidebar.right.tab.document.editor', UseSidebarRightTabInfo>
        }
      }
    }
  }
}

/** Standard input for every document body; entry-local stores and locale props can be intersected with it. */
export type DocumentPreviewProps = PropsRuntime<'sidebar.right.tab.document'>

/**
 * Forward the framework's tab reader to the selected document body.
 * @param _standard - framework standard props.
 * @param useTabInfo - enclosing tab's bound reader.
 * @returns the same reader, without another subscription adapter.
 */
export const documentTabInfoFactory: SlotHookFactory<'sidebar.right.tab.document', UseSidebarRightTabInfo> =
  (_standard, useTabInfo) => useTabInfo

/**
 * Forward the same official tab reader to an optional source editor.
 * @param _standard - framework standard props.
 * @param useTabInfo - enclosing tab's bound reader.
 * @returns the same reader.
 */
export const documentEditorTabInfoFactory: SlotHookFactory<'sidebar.right.tab.document.editor', UseSidebarRightTabInfo> =
  (_standard, useTabInfo) => useTabInfo
