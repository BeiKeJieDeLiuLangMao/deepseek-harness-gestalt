/**
 * Exact Zod codecs for Host-owned member-question Remote snapshot and settle.
 * @module @deepseek-ai/dsh-member-question-receiver/remote-schemas
 */

import { z } from 'zod'
import type { CompanionMemberQuestionSettledResult } from '@deepseek-ai/dsh-remote-protocol'
import type {
  MemberQuestionReceiverSnapshot,
  MemberQuestionRemoteSettleRequest,
  MemberQuestionRemoteSettleResponse,
} from './types.ts'

const idSchema = z.string().min(1)
const safeEpochSchema = z.number().int().nonnegative()
const memberQuestionOptionSchema = z.strictObject({
  label: z.string(),
  description: z.string().optional(),
})
const memberQuestionItemSchema = z.strictObject({
  id: z.string(),
  question: z.string(),
  header: z.string().optional(),
  options: z.array(memberQuestionOptionSchema).optional(),
  multiSelect: z.boolean().optional(),
})
const memberQuestionOperationSchema = z.strictObject({
  type: z.literal('member-question'),
  operationId: idSchema,
  questionId: idSchema,
  projectId: idSchema,
  originSessionId: idSchema,
  expiresAt: safeEpochSchema,
  origin: z.strictObject({
    projectName: z.string(),
    originSessionTitle: z.string(),
    askerAccountId: idSchema,
    askerRole: z.union([z.literal('owner'), z.literal('admin'), z.literal('member')]),
    askerDisplayName: z.string(),
    askerAvatarUrl: z.string(),
  }),
  background: z.string(),
  questions: z.array(memberQuestionItemSchema).min(1),
  references: z.array(z.strictObject({ path: z.string(), reason: z.string() })),
})
const cachedReferenceSchema = z.strictObject({
  path: z.string(),
  reason: z.string(),
  cachedPath: z.string().min(1),
})
const answerSchema = z.strictObject({
  id: z.string(),
  selected: z.array(z.string()),
  custom: z.string().optional(),
})
const terminalSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    type: z.literal('member-question-settled'),
    operationId: idSchema,
    questionId: idSchema,
    outcome: z.literal('answered'),
    settledAt: safeEpochSchema,
    settledByInstallationId: idSchema,
    settledByDeviceName: z.string(),
    answers: z.array(answerSchema),
  }),
  z.strictObject({
    type: z.literal('member-question-settled'),
    operationId: idSchema,
    questionId: idSchema,
    outcome: z.literal('declined'),
    settledAt: safeEpochSchema,
    settledByInstallationId: idSchema,
    settledByDeviceName: z.string(),
  }),
  z.strictObject({
    type: z.literal('member-question-settled'),
    operationId: idSchema,
    questionId: idSchema,
    outcome: z.union([z.literal('expired'), z.literal('withdrawn'), z.literal('superseded')]),
    settledAt: safeEpochSchema,
  }),
]) as unknown as z.ZodType<CompanionMemberQuestionSettledResult>
const pendingSchema = z.strictObject({
  questionId: idSchema,
  receivingSessionId: idSchema,
  receivingAccountId: idSchema,
  revision: z.number().int().nonnegative(),
  arrivedAt: safeEpochSchema,
  operation: memberQuestionOperationSchema,
  hostSessionId: idSchema.optional(),
  cachedReferences: z.array(cachedReferenceSchema).optional(),
  reservedAdmission: z.strictObject({
    rpcId: idSchema,
    mode: z.union([z.literal('queue'), z.literal('steer')]),
  }).optional(),
})
const terminalViewSchema = z.strictObject({
  questionId: idSchema,
  receivingSessionId: idSchema,
  receivingAccountId: idSchema,
  revision: z.number().int().nonnegative(),
  arrivedAt: safeEpochSchema,
  terminal: terminalSchema,
  brief: memberQuestionOperationSchema,
  hostSessionId: idSchema.optional(),
  cachedReferences: z.array(cachedReferenceSchema).optional(),
})

/**
 * Exact empty-argument snapshot result.
 * @typert schema
 */
export const memberQuestionRemoteSnapshotSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  pending: z.array(pendingSchema),
  terminal: z.array(terminalViewSchema),
}) as unknown as z.ZodType<MemberQuestionReceiverSnapshot>

/**
 * Exact settle request: Host identity and settledAt are absent.
 * @typert schema
 */
export const memberQuestionRemoteSettleRequestSchema = z.strictObject({
  receivingSessionId: idSchema,
  revision: z.number().int().nonnegative(),
  questionId: idSchema,
  response: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('answered'), answers: z.array(answerSchema) }),
    z.strictObject({ kind: z.literal('declined') }),
  ]),
}) as unknown as z.ZodType<MemberQuestionRemoteSettleRequest>

/**
 * Canonical terminal returned by Host-owned Remote settlement.
 * @typert schema
 */
export const memberQuestionRemoteSettleResponseSchema = terminalSchema as unknown as z.ZodType<
  MemberQuestionRemoteSettleResponse
>
