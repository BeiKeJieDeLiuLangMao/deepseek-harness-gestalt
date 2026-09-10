/**
 * Tool definitions and gating for IM simulation.
 *
 * Simulation tools:
 * - `im_sim_create`: create a simulation instance against configured target
 * - `im_sim_stop`: stop a simulation instance (terminal)
 * - `im_sim_send_as_member`: inject a member message in a simulated group
 * - `im_sim_send_as_managed_human`: inject a human message from managed account identity
 *
 * @module @deepseek-ai/dsh-im-core/simulation/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { encodeScopeId } from '../delivery/index.ts'
import type { ImSimulationInstanceId } from './types.ts'

/**
 * Register simulation tools on ctx.tools gated by workspace simulation target configuration.
 *
 * Invariant:
 * Simulation tools are registered only when the workspace has configured an IM simulation target.
 * An unconfigured workspace returns an empty disposer and does not register tools.
 *
 * @param ctx - Cordis Context with imSimulation, imConfig, and tools.
 * @param workspaceId - Workspace identifier.
 * @returns Disposer function to unregister tools.
 */
export async function registerSimulationTools(
  ctx: Context,
  workspaceId: WorkspaceId,
): Promise<() => void> {
  const config = await ctx.imConfig.getSimulationConfig(workspaceId)
  if (!config) {
    return () => {}
  }

  const disposers: (() => void)[] = []

  // 1. im_sim_create
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'im_sim_create',
        description: 'Create a new IM simulation instance against the configured workspace target.',
        parameters: {
          workspaceId: {
            type: 'string',
            required: true,
            description: 'Workspace ID of the simulation.',
          },
          instanceId: {
            type: 'string',
            description: 'Optional custom instance ID.',
          },
          conversationId: {
            type: 'string',
            description: 'Optional target conversation ID override.',
          },
          speakingMembers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of speaking member IDs for group simulation.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              instanceId: { type: 'string', required: true },
              scopeId: { type: 'string', required: true },
              status: { type: 'string', required: true },
              conversationKind: { type: 'string', required: true },
              conversationId: { type: 'string', required: true },
            },
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: `Created IM simulation instance: ${value.instanceId} (scope: ${value.scopeId})`,
            },
          ],
        },
        execute: async (args) => {
          const requestedWorkspaceId = brandString<WorkspaceId>(args.workspaceId)
          if (requestedWorkspaceId !== workspaceId) {
            throw new Error(
              `Simulation tools are bound to workspace "${workspaceId}"; cannot create an instance for "${args.workspaceId}".`,
            )
          }
          const simConfig = await ctx.imConfig.getSimulationConfig(workspaceId)
          if (!simConfig) {
            throw new Error(
              `Simulation target is not configured for workspace "${workspaceId}". Simulation tools are unavailable.`,
            )
          }

          const record = await ctx.imSimulation.createInstance({
            workspaceId,
            conversationId: args.conversationId ?? simConfig.targetConversationId ?? 'sim-conv-default',
            ...(args.instanceId ? { instanceId: brandString<ImSimulationInstanceId>(args.instanceId) } : {}),
            ...(args.speakingMembers ? { speakingMembers: args.speakingMembers } : {}),
          })

          const scopeId = encodeScopeId({
            kind: 'sim',
            instanceId: record.instanceId,
            conversationId: record.target.conversationId,
            conversationKind: record.target.conversationKind,
          })

          return {
            instanceId: record.instanceId,
            scopeId,
            status: record.status,
            conversationKind: record.target.conversationKind,
            conversationId: record.target.conversationId,
          }
        },
      }),
    ),
  )

  // 2. im_sim_stop
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'im_sim_stop',
        description: 'Explicitly stop an IM simulation instance. Stop is terminal.',
        parameters: {
          instanceId: {
            type: 'string',
            required: true,
            description: 'Simulation instance ID to stop.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              instanceId: { type: 'string', required: true },
              status: { type: 'string', required: true },
            },
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: `Stopped IM simulation instance: ${value.instanceId} (terminal)`,
            },
          ],
        },
        execute: async (args) => {
          const record = await ctx.imSimulation.stopInstance(
            brandString<ImSimulationInstanceId>(args.instanceId),
          )
          return {
            instanceId: record.instanceId,
            status: record.status,
          }
        },
      }),
    ),
  )

  // 3. im_sim_send_as_member
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'im_sim_send_as_member',
        description: 'Inject a message from a speaking group member into the simulation scope.',
        parameters: {
          instanceId: {
            type: 'string',
            required: true,
            description: 'Simulation instance ID.',
          },
          memberId: {
            type: 'string',
            required: true,
            description: 'Member identifier.',
          },
          text: {
            type: 'string',
            required: true,
            description: 'Message content text.',
          },
          memberNick: {
            type: 'string',
            description: 'Optional display nick for the member.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              messageId: { type: 'string', required: true },
              sequenceNumber: { type: 'number', required: true },
              senderClassification: { type: 'string', required: true },
            },
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: `Injected member message: ${value.messageId} (seq: ${value.sequenceNumber})`,
            },
          ],
        },
        execute: async (args) => {
          const message = await ctx.imSimulation.injectMemberMessage({
            instanceId: brandString<ImSimulationInstanceId>(args.instanceId),
            memberId: args.memberId,
            text: args.text,
            ...(args.memberNick ? { memberNick: args.memberNick } : {}),
          })

          return {
            messageId: message.messageId,
            sequenceNumber: message.sequenceNumber,
            senderClassification: message.senderClassification,
          }
        },
      }),
    ),
  )

  // 4. im_sim_send_as_managed_human
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'im_sim_send_as_managed_human',
        description: 'Inject a message as the managed account human identity (human_dsh).',
        parameters: {
          instanceId: {
            type: 'string',
            required: true,
            description: 'Simulation instance ID.',
          },
          text: {
            type: 'string',
            required: true,
            description: 'Message content text.',
          },
          humanNick: {
            type: 'string',
            description: 'Optional human display nick.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              messageId: { type: 'string', required: true },
              sequenceNumber: { type: 'number', required: true },
              senderClassification: { type: 'string', required: true },
            },
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: `Injected managed human message: ${value.messageId} (human_dsh)`,
            },
          ],
        },
        execute: async (args) => {
          const message = await ctx.imSimulation.injectManagedHumanMessage({
            instanceId: brandString<ImSimulationInstanceId>(args.instanceId),
            text: args.text,
            ...(args.humanNick ? { humanNick: args.humanNick } : {}),
          })

          return {
            messageId: message.messageId,
            sequenceNumber: message.sequenceNumber,
            senderClassification: message.senderClassification,
          }
        },
      }),
    ),
  )

  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
