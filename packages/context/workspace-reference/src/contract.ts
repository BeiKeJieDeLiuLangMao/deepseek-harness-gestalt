/**
 * Wire contract for workspace path search. Shared by the host Typert
 * manifest and the browser Remote contribution.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** One indexed workspace path on the wire. */
export interface WorkspacePathEntryWire {
  readonly relative: string
  readonly kind: 'file' | 'dir'
}

/** Session id lookup codec for the search Remote. */
export const sessionIdSchema = z.string().min(1)

/** One indexed workspace path on the picker wire. */
export const workspacePathEntrySchema = z.object({
  relative: z.string().min(1),
  kind: z.enum(['file', 'dir']),
}).readonly()

/** Host search invocation: session id lookup, full index, client ranks. */
export const WORKSPACE_REFERENCE_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: '@deepseek-ai/dsh-workspace-reference#workspaceReference/search',
    service: 'workspaceReference',
    namespace: 'workspaceReference',
    method: 'search',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'agent',
        wire: 'agentId',
        source: 'lookup',
        lookup: 'agent',
        codec: {
          mode: 'strict',
          typeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
          schema: sessionIdSchema,
        },
      },
    ],
    cancellation: { parameter: 'signal' },
    result: {
      mode: 'strict',
      typeSymbol: '@deepseek-ai/dsh-workspace-reference#WorkspacePathEntry[]',
      schema: z.array(workspacePathEntrySchema),
    },
  },
]
