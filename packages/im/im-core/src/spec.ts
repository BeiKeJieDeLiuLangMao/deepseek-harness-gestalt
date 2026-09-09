/**
 * Durable storageDomain specification and zod record schemas for the IM domain.
 * Enforces parser and storage boundaries without storing secrets.
 *
 * @module @deepseek-ai/dsh-im-core/spec
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  ImAccountId,
  ImAccountMetadata,
  ImRouteRule,
  ImRouteRuleId,
  ImWorkspaceSimulationConfig,
} from './types.ts'

export const imAccountIdSchema = z.string().min(1).transform((val: string) => brandString<ImAccountId>(val))
export const imRouteRuleIdSchema = z.string().min(1).transform((val: string) => brandString<ImRouteRuleId>(val))
export const workspaceIdSchema = z.string().min(1).transform((val: string) => brandString<WorkspaceId>(val))
export const credentialRefSchema = z.string().min(1).transform((val: string) => brandString<CredentialRef>(val))

export const imPlatformSchema = z.enum(['dingtalk', 'wangwang'])
export const imAccountStatusSchema = z.enum(['connected', 'disconnected', 'error'])
export const imConversationKindSchema = z.enum(['direct', 'group'])

export const imAccountRecordSchema = z.object({
  id: imAccountIdSchema,
  platform: imPlatformSchema,
  displayName: z.string().min(1),
  credentialRef: credentialRefSchema.optional(),
  status: imAccountStatusSchema,
  paused: z.boolean(),
  platformMetadata: z.record(z.string(), z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const imRouteTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('specific'), conversationId: z.string().min(1) }),
])

export const imGroupTriggerConfigSchema = z
  .object({
    mention: z.boolean().optional(),
    everyN: z.number().int().positive().optional(),
    fixedIntervalSeconds: z.number().int().positive().optional(),
  })
  .refine(
    (val: { mention?: boolean | undefined; everyN?: number | undefined; fixedIntervalSeconds?: number | undefined }) =>
      val.mention === true || val.everyN !== undefined || val.fixedIntervalSeconds !== undefined,
    { message: 'Group trigger must configure at least one condition (mention, everyN, or fixedIntervalSeconds)' },
  )

export const imRouteRuleRecordSchema = z
  .object({
    id: imRouteRuleIdSchema,
    accountId: imAccountIdSchema,
    conversationKind: imConversationKindSchema,
    target: imRouteTargetSchema,
    workspaceId: workspaceIdSchema,
    enabled: z.boolean(),
    groupTrigger: imGroupTriggerConfigSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .refine(
    (val: { conversationKind: string; groupTrigger?: unknown | undefined }) => {
      if (val.conversationKind === 'group') {
        return val.groupTrigger !== undefined
      }
      return val.groupTrigger === undefined
    },
    { message: 'Group triggers are required for group conversations and forbidden for direct messages' },
  )

export const imWorkspaceSimulationConfigSchema = z.object({
  workspaceId: workspaceIdSchema,
  targetAccountId: imAccountIdSchema,
  conversationKind: imConversationKindSchema,
  targetConversationId: z.string().min(1).optional(),
  updatedAt: z.string().datetime(),
})

/**
 * Root state for the IM domain ensuring atomic coherence of configuration state.
 */
export const imDomainStateSchema = z.object({
  initialized: z.boolean(),
  accountIds: z.array(imAccountIdSchema),
  ruleIds: z.array(imRouteRuleIdSchema),
  simulationWorkspaceIds: z.array(workspaceIdSchema).default([]),
})

export type ImDomainState = z.infer<typeof imDomainStateSchema>

/**
 * Storage domain specification for the IM domain.
 */
export const imDomainSpec = defineDomain({
  name: 'im_config',
  version: 1,
  global: {
    schema: imDomainStateSchema,
    initial: {
      initialized: false,
      accountIds: [],
      ruleIds: [],
      simulationWorkspaceIds: [],
    },
  },
  tables: {
    accounts: domainTable<ImAccountId, ImAccountMetadata>(
      imAccountRecordSchema as unknown as z.ZodType<ImAccountMetadata>,
    ),
    rules: domainTable<ImRouteRuleId, ImRouteRule>(
      imRouteRuleRecordSchema as unknown as z.ZodType<ImRouteRule>,
    ),
    simulations: domainTable<WorkspaceId, ImWorkspaceSimulationConfig>(
      imWorkspaceSimulationConfigSchema as unknown as z.ZodType<ImWorkspaceSimulationConfig>,
    ),
  },
})
