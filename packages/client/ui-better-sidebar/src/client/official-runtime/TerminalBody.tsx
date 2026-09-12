/** Official workbench body for UI-owned and model-owned Terminal occurrences. */
import { useMemo } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { lazyChunkComponent } from '../lazy-chunk.tsx'
import { t } from '../locales.ts'
import type {
  TerminalPreferenceSource, TerminalViewLifecycle,
} from '../TerminalView.tsx'
import { officialTerminalPayloadOf } from './payload.ts'
import {
  officialTerminalViewLifecycle, type OfficialTerminalContext,
} from './terminal-runtime.ts'

interface TerminalComponentProps {
  scope: { sessionId: string; cwd?: string }
  tabId: string
  preferences: TerminalPreferenceSource
  lifecycle: TerminalViewLifecycle
}

/** xterm stays in the existing lazy chunk after the workbench migration. */
const LazyOfficialTerminal = lazyChunkComponent<TerminalComponentProps>(
  'terminal',
  mod => mod.TerminalView as ComponentType<TerminalComponentProps> | undefined,
)

/** Services injected into the official Terminal body. */
export interface OfficialTerminalInjected {
  readonly ctx: OfficialTerminalContext
  readonly preferences: TerminalPreferenceSource
}

/** Official slot props for the Terminal body. */
export type OfficialTerminalBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & OfficialTerminalInjected

/**
 * Attach xterm to the Host runtime named by the occurrence payload.
 * @param props - official tab information, font preferences, and client services.
 * @returns the lazy terminal view, or an unavailable marker for invalid durable data.
 */
export function OfficialTerminalBody({
  useTabInfo, ctx, preferences,
}: OfficialTerminalBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const payload = officialTerminalPayloadOf(tab.payload)
  const ownerSessionId = tab.sessionId
  const lifecycle = useMemo(
    () => officialTerminalViewLifecycle(ctx, ownerSessionId, tab.id),
    [ctx, ownerSessionId, tab.id],
  )
  if (payload === undefined) {
    return <div role="status">{t('terminalError')}</div>
  }
  const runtimeId = payload.owner === 'agent' ? `agent:${payload.runtimeId}` : payload.runtimeId
  const cwd = ctx.sessions.list.getSnapshot().byId[ownerSessionId]?.cwd
  return (
    <LazyOfficialTerminal
      scope={{ sessionId: ownerSessionId, ...(cwd === undefined ? {} : { cwd }) }}
      tabId={runtimeId}
      preferences={preferences}
      lifecycle={lifecycle}
    />
  )
}
