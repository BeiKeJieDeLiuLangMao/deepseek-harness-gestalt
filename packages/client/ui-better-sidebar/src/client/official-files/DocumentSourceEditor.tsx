/** Better's CodeMirror editor adapted to the official document editor slot */
import type { ReactNode } from 'react'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { TextEditorCore } from '../TextEditor.tsx'
import { isAbsolutePath } from '../paths.ts'
import { resolveSidebarPath } from '../produced-files.ts'
import type {} from './contract.ts'

/** Capabilities kept private to Better's editor implementation. */
export interface DocumentSourceEditorInjected {
  readonly writeFile: (sessionId: import('@deepseek-ai/dsh-session/types').SessionId, path: string, content: string) => Promise<void>
  readonly insertText: (sessionId: import('@deepseek-ai/dsh-session/types').SessionId, text: string) => void
}

/** Renderer-specific editor body; preview loading and tab lifetime remain official-owned. */
export function DocumentSourceEditor(props: PropsRuntime<'sidebar.right.tab.document.editor'> & InjectFace<DocumentSourceEditorInjected>): ReactNode {
  const { tab } = props.useTabInfo()
  const sessions = props.useSessions(value => value)
  const parsed = parseFileAddress(props.resourceAddress)
  if (parsed?.scope !== 'session') return null
  const sessionId = SessionId(parsed.sessionId)
  const cwd = sessions.byId[sessionId]?.cwd
  const scope = { sessionId, cwd }
  const path = isAbsolutePath(parsed.path) ? parsed.path : cwd === undefined ? undefined : resolveSidebarPath(cwd, parsed.path)
  if (path === undefined) return null
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
