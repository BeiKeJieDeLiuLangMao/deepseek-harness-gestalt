import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ImAccountId, ImRouteRuleId } from '@deepseek-ai/dsh-im-core/types'
import type ImConfigService from '@deepseek-ai/dsh-im-core'
import { ImDeliveryService, encodeScopeId } from '@deepseek-ai/dsh-im-core'
import type { ImDeliveryScope } from '@deepseek-ai/dsh-im-core'

const configPath = process.argv[2]
if (!configPath) throw new Error('configPath required')
const action = process.argv[3] // 'write' or 'read'
if (!action) throw new Error('action required: write | read')

const ctx = new Context()
await ctx.plugin(Loader)
ctx.loader.builtins.include = Include

await ctx.loader.create({
  name: 'cordis:include',
  config: { path: pathToFileURL(configPath).href },
})
await ctx.loader.await()

const service = ctx.get('imConfig') as ImConfigService
if (!service) throw new Error('imConfig service not loaded by real Loader')

const deliveryService = ctx.get('imDelivery') as ImDeliveryService
if (!deliveryService) throw new Error('imDelivery service not loaded by real Loader')

const reportFile = './im-loader-report.json'

if (action === 'write') {
  const accountId = brandString<ImAccountId>('acc-loader-dt')
  await service.upsertAccount({
    id: accountId,
    platform: 'dingtalk',
    displayName: 'Loader DingTalk Account',
    credentialRef: brandString<CredentialRef>('CRED_LOADER_TOKEN'),
    status: 'connected',
    paused: false,
  })

  const ws1 = brandString<WorkspaceId>('ws-loader-1')
  const ruleId = brandString<ImRouteRuleId>('rule-loader-1')
  await service.createRouteRule({
    id: ruleId,
    accountId,
    conversationKind: 'group',
    target: { kind: 'all' },
    workspaceId: ws1,
    enabled: true,
    groupTrigger: {
      mention: true,
      everyN: 3,
    },
  })

  await service.setSimulationConfig({
    workspaceId: ws1,
    targetAccountId: accountId,
    conversationKind: 'group',
  })

  const route1 = await service.resolveRoute({
    accountId,
    conversationKind: 'group',
    conversationId: 'group-dyn-101',
  })

  // Delivery service write operations
  const scope: ImDeliveryScope = {
    kind: 'real',
    platform: 'dingtalk',
    accountId,
    conversationId: 'group-dyn-101',
  }
  const scopeId = encodeScopeId(scope)
  const inboundRes = await deliveryService.receiveInbound({
    scope,
    externalMessageId: 'ext-msg-loader-1',
    senderClassification: 'external',
    senderEvidence: { rawSenderId: 'ext-user-1' },
    content: { text: 'Hello via Loader' },
  })

  const cursorAfterInbound = await deliveryService.getCursor(scopeId)

  await writeFile(reportFile, JSON.stringify({
    phase: 'write',
    accountId,
    ruleId,
    workspaceId: ws1,
    routeStatus: route1.status,
    inboundMessageId: inboundRes.message.messageId,
    cursorLastReceived: cursorAfterInbound?.lastReceivedSequenceNumber,
  }))
} else if (action === 'read') {
  const accountId = brandString<ImAccountId>('acc-loader-dt')
  const ruleId = brandString<ImRouteRuleId>('rule-loader-1')
  const ws1 = brandString<WorkspaceId>('ws-loader-1')

  const account = await service.getAccount(accountId)
  const rule = await service.getRouteRule(ruleId)
  const sim = await service.getSimulationConfig(ws1)
  const route = await service.resolveRoute({
    accountId,
    conversationKind: 'group',
    conversationId: 'group-dyn-102',
  })

  // Delivery service read operations
  const scope: ImDeliveryScope = {
    kind: 'real',
    platform: 'dingtalk',
    accountId,
    conversationId: 'group-dyn-101',
  }
  const scopeId = encodeScopeId(scope)
  const cursor = await deliveryService.getCursor(scopeId)
  const history = await deliveryService.queryHistory({ scopeId })

  // Verify deduplication across processes
  const dupeRes = await deliveryService.receiveInbound({
    scope,
    externalMessageId: 'ext-msg-loader-1',
    senderClassification: 'external',
    senderEvidence: { rawSenderId: 'ext-user-1' },
    content: { text: 'Duplicate in process 2' },
  })

  await writeFile(reportFile, JSON.stringify({
    phase: 'read',
    account,
    rule,
    sim,
    route,
    cursor,
    historyLength: history.length,
    dupeDetected: dupeRes.duplicate,
  }))
}

await ctx.fiber.dispose()
