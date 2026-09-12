/** Better's CodeMirror editor adapted to the official document editor slot */
import type { ReactNode } from 'react'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { TextEditorCore } from '../TextEditor.tsx'
import type {} from './contract.ts'

/** Capabilities kept private to Better's editor implementation. */
export interface DocumentSourceEditorInjected {
  readonly writeFile: (sessionId: import('@deepseek-ai/dsh-session/types').SessionId, path: string, content: string) => Promise<void>
  readonly insertText: (sessionId: import('@deepseek-ai/dsh-session/types').SessionId, text: string) => void
}

/** Renderer-specific editor body; preview loading and tab lifetime remain official-owned. */
export function DocumentSourceEditor(props: PropsRuntime<'sidebar.right.tab.document.editor'> & InjectFace<DocumentSourceEditorInjected>): ReactNode {
  const { tab } = props.useTabInfo()
  const parsed = parseFileAddress(props.resourceAddress)
  if (parsed?.scope !== 'session') return null
  const sessionId = SessionId(parsed.sessionId)
  const scope = { sessionId }
  const path = parsed.path
  return (
    <TextEditorCore
      scope={scope}
      path={path}
      title={tab.title}
      viewerId={props.documentId.endsWith('/markdown') ? 'markdown' : 'code'}
      content={props.content.text}
      toolbar="self"
      retained={props.retained}
      onRetain={props.retain}
      onDirtyChange={props.setDirty}
      writeFile={content => props.writeFile(sessionId, path, content).then(() => {
        if (!tab.signal.aborted) props.saved()
      })}
      insertIntoConversation={text => { props.insertText(sessionId, text) }}
      htmlSafety={{ forceUnsandboxed: false, defaultUnsandboxed: false }}
      line={(tab.navigation.params as { readonly line?: number } | undefined)?.line}
      navigationRevision={tab.navigation.revision}
    />
  )
}
