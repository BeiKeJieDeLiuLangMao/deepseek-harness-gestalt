/**
 * Zod validation schemas for Wangwang adapter configuration and records.
 *
 * @module @deepseek-ai/dsh-im-wangwang/spec
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import type {
  WangwangAdapterConfig,
} from './types.ts'

export const credentialRefSchema = z.string().min(1).transform((val: string) => brandString<CredentialRef>(val))
export const imAccountIdSchema = z.string().min(1).transform((val: string) => brandString<ImAccountId>(val))

export const wangwangAdmittedMerchantSchema = z.object({
  merchantId: z.string().min(1),
  accountId: imAccountIdSchema,
  displayName: z.string().optional(),
  accessKeyRef: credentialRefSchema,
  secretKeyRef: credentialRefSchema,
  mainServiceAccountId: z.string().optional(),
})

export const wangwangAdapterConfigSchema = z.object({
  endpoint: z.string().url(),
  admittedMerchants: z.array(wangwangAdmittedMerchantSchema).min(1),
  timestampToleranceMs: z.number().int().positive().optional().default(300_000),
  pollLimit: z.number().int().min(1).max(100).optional().default(50),
})

export function validateWangwangConfig(input: unknown): WangwangAdapterConfig {
  return wangwangAdapterConfigSchema.parse(input) as WangwangAdapterConfig
}
