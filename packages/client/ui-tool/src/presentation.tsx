/** Public Tool presentation seam for Web compositions outside the Desktop page shell. */

import type { ReactNode } from 'react'
import type { HostDescription } from '@deepseek-ai/dsh-client-connection/client'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallOwnerProps } from './client/contract/slots.ts'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ToolCallTree } from './client/tool/ToolCallTree.tsx'
import { GenericToolCard } from './client/tool/toolviews/GenericToolCard.tsx'

/** Props for one authoritative Tool lifecycle tree. */
export interface ToolPresentationProps {
  /** Desktop-authoritative running or settled root call. */
  block: ToolCallBlock
  /** Session Workspace root used for path and terminal presentation. */
  cwd?: string | undefined
  /** Desktop account home used to abbreviate paths. */
  home?: string | undefined
  /** Open a file through the Mobile authority adapter; absent keeps paths read-only. */
  openFile?: ((path: string) => void) | undefined
  /** Inspect a call through an optional product route. */
  inspectCall?: ((callId: string) => void) | undefined
  /** Shared conversation translator. */
  t: TranslateNS<'conversation'>
}

/**
 * Render one Tool lifecycle and its subcalls through the same ToolCallTree and GenericToolCard used by Desktop.
 * Specialized render intents remain available because GenericToolCard consumes the authoritative call/result views.
 */
export function ToolPresentation({
  block, cwd, home, openFile, inspectCall, t,
}: ToolPresentationProps): ReactNode {
  const node = {
    key: `tool:${block.callId}`,
    kind: 'tool-call',
    id: block.callId,
    target: 'chat',
    anchorSeq: 'kind' in block ? block.seq : Number.MAX_SAFE_INTEGER,
    location: { kind: 'session' },
    visibility: 'visible',
    data: { root: block },
  } as ChatNode<'tool-call'>
  const renderSlot = (_key: string, owner: object): ReactNode => (
    <GenericToolCard {...(owner as ToolCallOwnerProps)} t={t} />
  )
  const description: HostDescription | undefined = home === undefined
    ? undefined
    : { version: 'mobile', cwd: cwd ?? '', attachedSessions: 1, home, canOpenPath: openFile !== undefined }
  const props = {
    node,
    selectedCallId: undefined,
    cwd,
    openFile,
    inspectCall,
    renderSlot,
    useHostDescription: <T,>(selector: (value: HostDescription | undefined) => T): T => selector(description),
    t,
  }
  return <ToolCallTree {...props} />
}
