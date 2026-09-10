/**
 * IM tool definitions: `im_send_message` and `im_query_history`.
 *
 * @module @deepseek-ai/dsh-im-core/coordination/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import {
  type ImDeliveryScope,
  type ImOutboundRequestId,
  type ImScopeId,
  unescapeScopeComponent,
} from '../delivery/index.ts'
import type { ImAccountId, ImPlatform } from '../types.ts'

/**
 * Parse an encoded scope ID back into an ImDeliveryScope.
 *
 * @param scopeId - Encoded scope ID string.
 * @returns Parsed ImDeliveryScope or undefined if invalid format.
 */
export function parseScopeId(scopeId: string): ImDeliveryScope | undefined {
  const parts = scopeId.split(':')
  if (parts[0] === 'real' && parts.length === 4) {
    const platform = parts[1]
    const accountId = parts[2]
    const conversationId = parts[3]
    if (!platform || !accountId || !conversationId) return undefined
    return {
      kind: 'real',
      platform: unescapeScopeComponent(platform) as ImPlatform,
      accountId: brandString<ImAccountId>(unescapeScopeComponent(accountId)),
      conversationId: unescapeScopeComponent(conversationId),
    }
  }
  if (parts[0] === 'sim' && parts.length === 3) {
    const instanceId = parts[1]
    const conversationId = parts[2]
    if (!instanceId || !conversationId) return undefined
    return {
      kind: 'sim',
      instanceId: unescapeScopeComponent(instanceId),
      conversationId: unescapeScopeComponent(conversationId),
    }
  }
  return undefined
}

/**
 * Register IM outbound messaging and history tools on `ctx.tools`.
 *
 * @param ctx - Cordis Context with imDelivery, imConfig, and tools.
 * @returns Disposer function to unregister tools.
 */
export function registerImTools(ctx: Context): () => void {
  const disposers: (() => void)[] = []

  // 1. im_send_message
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'im_send_message',
        description: 'Send an outbound reply message to an IM conversation scope.',
        parameters: {
          scopeId: {
            type: 'string',
            required: true,
            description: 'Target IM conversation scope ID (real:... or sim:...).',
          },
          text: {
            type: 'string',
            required: true,
            description: 'Message content text to send.',
          },
          replyToExternalMessageId: {
            type: 'string',
            description: 'Optional external message ID being replied to.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', required: true },
              requestId: { type: 'string', required: true },
              scopeId: { type: 'string', required: true },
              sent: { type: 'boolean', required: true },
            },
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: `Outbound IM message registered: status=${value.status}, requestId=${value.requestId}`,
            },
          ],
        },
        execute: async (args) => {
          const parsedScope = parseScopeId(args.scopeId)
          if (!parsedScope) {
            throw new Error(`Invalid IM scope ID format: "${args.scopeId}"`)
          }

          let workspaceId: WorkspaceId | undefined
          const conversationKind = parsedScope.kind === 'real'
            ? (parsedScope.conversationKind ?? 'direct')
            : 'direct'

          if (parsedScope.kind === 'real') {
            const rules = await ctx.imConfig.listRouteRules()
            const matchedRule = rules.find(
              r =>
                r.accountId === parsedScope.accountId &&
                ((r.target.kind === 'specific' && r.target.conversationId === parsedScope.conversationId) ||
                  r.target.kind === 'all'),
            )
            const resolvedKind = parsedScope.conversationKind ?? matchedRule?.conversationKind ?? conversationKind
            const routeResult = await ctx.imConfig.resolveRoute({
              accountId: parsedScope.accountId,
              conversationKind: resolvedKind,
              conversationId: parsedScope.conversationId,
            })
            if (
              routeResult.status === 'matched' ||
              routeResult.status === 'disabled' ||
              routeResult.status === 'account_paused'
            ) {
              workspaceId = routeResult.workspaceId
            }
          } else if (parsedScope.kind === 'sim') {
            const simConfig = await ctx.imConfig.getSimulationConfig(
              brandString<WorkspaceId>(parsedScope.instanceId),
            )
            if (!simConfig) {
              throw new Error(
                `IM simulation is not configured for simulation scope "${args.scopeId}"; cannot simulate delivery.`,
              )
            }
            workspaceId = simConfig.workspaceId
          } else {
            throw new Error('Unsupported scope kind for IM send message')
          }

          const requestId = brandString<ImOutboundRequestId>(
            `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          )

          // Wangwang.sendMessage owns registerOutbound; calling it here would double-register.
          if (parsedScope.kind === 'real' && parsedScope.platform === 'wangwang') {
            const wangwang = ctx.get('imWangwang') as
              | {
                getAdmittedMerchantByAccount?: (accountId: ImAccountId) => {
                  merchantId: string
                  mainServiceAccountId?: string
                }
                sendMessage: (request: Record<string, unknown>) => Promise<{
                  status: string
                  error?: string
                }>
              }
              | undefined
            if (!wangwang) {
              throw new Error('Wangwang adapter (imWangwang) is not available; cannot send real outbound')
            }
            const merchant = wangwang.getAdmittedMerchantByAccount?.(parsedScope.accountId)
            const sendResult = await wangwang.sendMessage({
              accountId: parsedScope.accountId,
              merchantId: merchant?.merchantId ?? String(parsedScope.accountId),
              customerId: parsedScope.conversationId,
              content: args.text,
              userId: merchant?.mainServiceAccountId ?? String(parsedScope.accountId),
              requestId,
              isAi: true,
            })
            if (sendResult.status === 'result_unknown') {
              return { status: 'result_unknown', requestId, scopeId: args.scopeId, sent: false }
            }
            if (sendResult.status !== 'sent') {
              throw new Error(`Wangwang send failed: ${sendResult.error ?? sendResult.status}`)
            }
            return { status: 'sent', requestId, scopeId: args.scopeId, sent: true }
          }

          const outbound = await ctx.imDelivery.registerOutbound({
            requestId,
            scope: parsedScope,
            ...(workspaceId !== undefined ? { workspaceId } : {}),
            intent: 'ai',
            content: { text: args.text },
            ...(args.replyToExternalMessageId
              ? { replyToExternalMessageId: args.replyToExternalMessageId }
              : {}),
          })

          if (outbound.status === 'pre_send_failed') {
            throw new Error(
              `Outbound message pre-send validation failed: ${outbound.preSendFailureReason ?? 'unknown reason'}`,
            )
          }

          if (parsedScope.kind === 'real' && parsedScope.platform === 'dingtalk') {
            const dingtalk = ctx.get('imDingtalk') as
              | {
                sendMessage: (request: {
                  accountId: ImAccountId
                  conversationKind: typeof conversationKind
                  targetId: string
                  text: string
                  isAi: true
                }) => Promise<{ status: string; openTaskId?: string; error?: string }>
              }
              | undefined
            if (!dingtalk) {
              throw new Error('DingTalk adapter (imDingtalk) is not available; cannot send real outbound')
            }
            const sent = await dingtalk.sendMessage({
              accountId: parsedScope.accountId,
              conversationKind: parsedScope.conversationKind ?? conversationKind,
              targetId: parsedScope.conversationId,
              text: args.text,
              isAi: true,
            })
            if (sent.status === 'result_unknown') {
              const settled = await ctx.imDelivery.settleOutbound({
                requestId,
                status: 'result_unknown',
                receipt: {
                  ...(sent.error !== undefined ? { errorMessage: sent.error } : {}),
                  rawStatus: sent.status,
                },
              })
              return {
                status: settled.status,
                requestId: settled.requestId,
                scopeId: settled.scopeId,
                sent: false,
              }
            }
            if (sent.status !== 'sent') {
              await ctx.imDelivery.settleOutbound({
                requestId,
                status: 'confirmed_failed',
                receipt: {
                  ...(sent.error !== undefined ? { errorMessage: sent.error } : {}),
                  rawStatus: sent.status,
                },
              })
              throw new Error(`DingTalk send failed: ${sent.error ?? sent.status}`)
            }
            const settled = await ctx.imDelivery.settleOutbound({
              requestId,
              status: 'sent',
              receipt: {
                ...(sent.openTaskId !== undefined ? { externalReceiptId: sent.openTaskId } : {}),
                rawStatus: 'sent',
              },
              ...(sent.openTaskId !== undefined ? { externalMessageId: sent.openTaskId } : {}),
            })
            return {
              status: settled.status,
              requestId: settled.requestId,
              scopeId: settled.scopeId,
              sent: true,
            }
          }

          if (parsedScope.kind === 'real') {
            throw new Error(`Unsupported IM platform for real send: ${parsedScope.platform}`)
          }

          return {
            status: outbound.status,
            requestId: outbound.requestId,
            scopeId: outbound.scopeId,
            sent: outbound.status === 'sent',
          }
        },
      }),
    ),
  )

  // 2. im_query_history
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'im_query_history',
        description: 'Query historical messages within an IM conversation scope.',
        parameters: {
          scopeId: {
            type: 'string',
            required: true,
            description: 'Target IM conversation scope ID.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default 20).',
          },
          beforeSequenceNumber: {
            type: 'number',
            description: 'Optional upper bound sequence number.',
          },
          afterSequenceNumber: {
            type: 'number',
            description: 'Optional lower bound sequence number.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              count: { type: 'number', required: true },
              messages: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    messageId: { type: 'string', required: true },
                    sequenceNumber: { type: 'number', required: true },
                    senderClassification: { type: 'string', required: true },
                    senderNick: { type: 'string' },
                    text: { type: 'string', required: true },
                    stage: { type: 'string', required: true },
                    receivedAt: { type: 'string', required: true },
                  },
                },
              },
            },
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: `Retrieved ${value.count} message(s) from conversation history.`,
            },
          ],
        },
        execute: async (args) => {
          const scopeId = brandString<ImScopeId>(args.scopeId)
          const records = await ctx.imDelivery.queryHistory({
            scopeId,
            limit: args.limit ?? 20,
            ...(args.beforeSequenceNumber !== undefined
              ? { beforeSequenceNumber: args.beforeSequenceNumber }
              : {}),
            ...(args.afterSequenceNumber !== undefined
              ? { afterSequenceNumber: args.afterSequenceNumber }
              : {}),
          })

          return {
            count: records.length,
            messages: records.map(r => ({
              messageId: r.messageId,
              sequenceNumber: r.sequenceNumber,
              senderClassification: r.senderClassification,
              ...(r.senderEvidence.rawSenderNick !== undefined
                ? { senderNick: r.senderEvidence.rawSenderNick }
                : {}),
              text: r.content.text,
              stage: r.stage,
              receivedAt: r.receivedAt,
            })),
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
