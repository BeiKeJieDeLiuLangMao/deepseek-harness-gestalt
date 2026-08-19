/** Strict host Typert manifest for workspace path search. */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { WORKSPACE_REFERENCE_INVOCATIONS } from './contract.ts'

/** Host face registered through `ctx.typert.register`. */
export const TYPERT_MANIFEST: TypertContribution = {
  package: '@deepseek-ai/dsh-workspace-reference',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'workspaceReference',
        exportName: 'WorkspaceReferenceRuntime',
        description: 'Workspace path index search for the composer @ picker.',
        tags: [],
        members: [
          {
            kind: 'method',
            name: 'search',
            signature: 'search(agent: Agent, signal: AbortSignal): Promise<readonly WorkspacePathEntry[]>',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: WORKSPACE_REFERENCE_INVOCATIONS,
}
