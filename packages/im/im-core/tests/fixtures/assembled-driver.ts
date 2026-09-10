import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness,
} from '@deepseek-ai/dsh-agent-loop-testkit'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ImAccountId, ImRouteRuleId } from '@deepseek-ai/dsh-im-core/types'
import type ImConfigService from '@deepseek-ai/dsh-im-core'
import {
  encodeScopeId,
  registerSimulationTools,
  type ImDeliveryService,
  type ImExecutionService,
  type ImOutboundRequestId,
  type ImSimulationInstanceId,
  type ImSimulationService,
} from '@deepseek-ai/dsh-im-core'
import { AssembledStubSubprocess, dwsSendArgv } from './assembled-subprocess.ts'

const configPath = process.argv[2]
if (!configPath) throw new Error('configPath required')

class KeylessAdapter extends LlmAdapter {
  requests = 0
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({ provider, id: model, name: model })
  }
  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests += 1
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const ctx = new Context()
await ctx.plugin(Loader)
ctx.loader.builtins.include = Include
ctx.plugin(AssembledStubSubprocess)
await ctx.loader.create({
  name: 'cordis:include',
  config: { path: pathToFileURL(configPath).href },
})
await ctx.loader.await()

const config = ctx.get('imConfig') as ImConfigService
if (!config) throw new Error('imConfig service not loaded by real Loader')
const delivery = ctx.get('imDelivery') as ImDeliveryService
if (!delivery) throw new Error('imDelivery service not loaded by real Loader')
const execution = ctx.get('imExecution') as ImExecutionService
if (!execution) throw new Error('imExecution service not loaded by real Loader')
const simulation = ctx.get('imSimulation') as ImSimulationService
if (!simulation) throw new Error('imSimulation service not loaded by real Loader')
if (!ctx.get('imDingtalk')) throw new Error('imDingtalk service not loaded by real Loader')

const adapter = new KeylessAdapter()
await mountAgentLoopTestDependencies(ctx)
ctx.on('session/flush', () => {})
ctx.llm.registerAdapter(['mock'], adapter)
const harness = await mountAgentLoopTestHarness(ctx)
const agent = await harness.create(SessionId('sess-tested'), { provider: 'mock', model: 'mock' })

const accountId = brandString<ImAccountId>('acc-assembled')
const testedWorkspaceId = brandString<WorkspaceId>('ws-tested')
const simUserWorkspaceId = brandString<WorkspaceId>('ws-simuser')
await config.upsertAccount({
  id: accountId,
  platform: 'dingtalk',
  displayName: 'Assembled DingTalk',
  status: 'connected',
  paused: false,
})
await config.createRouteRule({
  id: brandString<ImRouteRuleId>('rule-assembled-group'),
  accountId,
  conversationKind: 'group',
  target: { kind: 'specific', conversationId: '度假开发联调群' },
  workspaceId: testedWorkspaceId,
  enabled: true,
  groupTrigger: { mention: true },
})
await config.setSimulationConfig({
  workspaceId: simUserWorkspaceId,
  targetAccountId: accountId,
  conversationKind: 'group',
  targetConversationId: '度假开发联调群',
})
const disposeSimTools = await registerSimulationTools(ctx, simUserWorkspaceId)

const route = await config.resolveRoute({
  accountId, conversationKind: 'group', conversationId: '度假开发联调群',
})

const first = await simulation.createInstance({
  workspaceId: simUserWorkspaceId,
  conversationId: '度假开发联调群',
  conversationKind: 'group',
  instanceId: brandString<ImSimulationInstanceId>('sim-one'),
  speakingMembers: ['alice'],
})
const second = await simulation.createInstance({
  workspaceId: simUserWorkspaceId,
  conversationId: '度假开发联调群',
  conversationKind: 'group',
  instanceId: brandString<ImSimulationInstanceId>('sim-two'),
  speakingMembers: ['alice'],
})

const member = await simulation.injectMemberMessage({
  instanceId: first.instanceId, memberId: 'alice', memberNick: 'Alice',
  text: '@bot 周末发布回滚方案谁来跟？',
})
const human = await simulation.injectManagedHumanMessage({
  instanceId: first.instanceId, text: '我从 DSH 补一句', humanNick: '陈小宇',
})
const simScopeId = encodeScopeId({
  kind: 'sim', instanceId: first.instanceId, conversationId: first.target.conversationId,
})
const admitted = await execution.admitInbound({
  scopeId: simScopeId, message: member, agent,
})
await agent.whenIdle()

const mockExec = {} as never
const simSend = await ctx.tools.get('im_send_message')!.execute(
  { scopeId: simScopeId, text: '模拟侧已回复' }, mockExec,
) as { status: string; requestId: string }
const argvAfterSim = dwsSendArgv.length

const realScope = {
  kind: 'real' as const, platform: 'dingtalk' as const, accountId, conversationId: '度假开发联调群',
}
await delivery.receiveInbound({
  scope: realScope,
  externalMessageId: 'ext-assembled-1',
  senderClassification: 'external',
  senderEvidence: { rawSenderId: 'alice', rawSenderNick: 'Alice', clientSource: 'external' },
  content: { text: '@bot 周末发布回滚方案谁来跟？' },
})
const realSend = await ctx.tools.get('im_send_message')!.execute(
  { scopeId: encodeScopeId(realScope), text: '真实夹具已回复' }, mockExec,
) as { status: string }
const groupSendArgv = dwsSendArgv.at(-1) ?? []

const unknownSend = await ctx.tools.get('im_send_message')!.execute(
  { scopeId: encodeScopeId(realScope), text: '身份待确认' }, mockExec,
) as { status: string; sent: boolean; requestId: string }

const stopped = await simulation.stopInstance(first.instanceId)
let stopError = ''
try {
  await simulation.injectMemberMessage({
    instanceId: first.instanceId, memberId: 'alice', text: 'after stop',
  })
} catch (error) {
  stopError = error instanceof Error ? error.message : String(error)
}
const stillLive = await simulation.injectMemberMessage({
  instanceId: second.instanceId, memberId: 'alice', text: 'second instance still running',
})

const simHistory = await delivery.queryHistory({ scopeId: simScopeId })
const simOutbound = await delivery.getOutbound(
  brandString<ImOutboundRequestId>(simSend.requestId),
)
const unknownOutbound = await delivery.getOutbound(
  brandString<ImOutboundRequestId>(unknownSend.requestId),
)

await writeFile('./assembled-report.json', JSON.stringify({
  route,
  testedWorkspaceId: first.testedWorkspaceId,
  memberSender: member.senderClassification,
  humanSender: human.senderClassification,
  triggered: admitted.triggered,
  triggerReason: admitted.triggerReason,
  modelRequests: adapter.requests,
  simSendStatus: simSend.status,
  argvAfterSim,
  realSendStatus: realSend.status,
  groupSendArgv,
  unknownStatus: unknownSend.status,
  unknownSent: unknownSend.sent,
  stoppedStatus: stopped.status,
  stopError,
  secondSender: stillLive.senderClassification,
  simHistory: simHistory.map(row => ({
    id: row.messageId,
    text: row.content.text,
    who: row.senderEvidence.rawSenderNick ?? row.senderClassification,
    sender: row.senderClassification,
    inboundStage: row.stage,
  })),
  simOutbound: simOutbound === undefined ? undefined : {
    id: simOutbound.requestId,
    text: simOutbound.content.text,
    who: '数字员工',
    sender: 'ai_outbound',
    outboundStatus: simOutbound.status,
  },
  unknownOutbound: unknownOutbound === undefined ? undefined : {
    id: unknownOutbound.requestId,
    text: unknownOutbound.content.text,
    who: '数字员工',
    sender: 'ai_outbound',
    outboundStatus: unknownOutbound.status,
  },
}))

disposeSimTools()
await ctx.fiber.dispose()
