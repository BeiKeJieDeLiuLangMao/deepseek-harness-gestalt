/** Fork delegation keeps completed context while selecting only authorized routes. */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as Fork from '@deepseek-ai/dsh-subagent-fork-in-process'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as tool from '../src/index.ts'
import { registerListSubagentModels } from '../src/list-models.ts'
import SubagentModelSelectionConfig from '../src/model-selection-settings.ts'
import { text } from './harness.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
const routes = [{ provider: 'beta', model: 'child-model' }]
const config = (provider: 'spawn' | 'fork'): tool.Config => ({
  provider,
  toolName: provider === 'spawn' ? 'subagent' : 'subagent_fork',
  modelSelectionSettings: true,
  backgroundMode: 'continuable',
})

async function boot(order: readonly ('spawn' | 'fork')[] = ['spawn', 'fork'], enabled = true) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SubagentModelSelectionConfig, { enabled, allowedModels: routes })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(Fork, { providerName: 'fork' })
  const reasoning = {
    efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }, { id: ReasoningEffortId('high'), name: 'High' }],
    defaultEffort: ReasoningEffortId('low'),
  }
  const alpha = new MockAdapter([textResponse('parent answer'), textResponse('inherited answer')], reasoning)
  const beta = new MockAdapter([textResponse('routed answer')], reasoning)
  ctx.llm.registerAdapter(['alpha'], alpha)
  ctx.llm.registerAdapter(['beta'], beta)
  const { agent } = await ctx.agents.create({
    sessionId: SessionId('fork-route-parent'),
    agentOptions: { provider: 'alpha', model: 'parent-model', reasoningEffort: ReasoningEffortId('high') },
  })
  const fibers = []
  for (const provider of order) {
    const fiber = agent.ctx.plugin(tool, config(provider))
    await fiber
    fibers.push(fiber)
  }
  return { ctx, agent, fibers, alpha, beta }
}

function callFork(ctx: Context, agent: Awaited<ReturnType<typeof boot>>['agent'], args: Record<string, unknown>) {
  return ctx.tools.execute({
    name: 'subagent_fork', callId: ToolCallId('fork-route'), agent,
    signal: new AbortController().signal,
    arguments: { description: 'fork route test', prompt: 'child task', run_in_background: false, ...args },
  })
}

describe('model-selectable fork', () => {
  it.each([['spawn', 'fork'], ['fork', 'spawn']] as const)('shares discovery in %s/%s order through removal and reload', async (first, second) => {
    const { ctx, agent, fibers } = await boot([first, second])
    for (const name of ['subagent', 'subagent_fork']) {
      const schema = ctx.tools.schemas(agent).find(row => row.name === name)
      expect(schema?.parameters).toMatchObject({ properties: {
        provider: { type: 'string' }, model: { type: 'string' }, reasoning_effort: { type: 'string' },
      } })
    }
    const discoveries = () => ctx.tools.schemas(agent).filter(row => row.name === 'list_subagent_models')
    expect(discoveries()).toHaveLength(1)
    await fibers[0]!.dispose()
    expect(discoveries()).toHaveLength(1)
    const replacement = agent.ctx.plugin(tool, config(first))
    await replacement
    expect(discoveries()).toHaveLength(1)
    await fibers[1]!.dispose()
    expect(discoveries()).toHaveLength(1)
    await replacement.dispose()
    expect(discoveries()).toHaveLength(0)
  })

  it('retains completed parent context when selecting an authorized route and its default effort', async () => {
    const { ctx, agent, beta } = await boot()
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'parent context sentinel' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    const prefix = agent.session.snapshotEvents()
    let child: typeof agent | undefined
    ctx.on('subagent/start', (event) => { child = ctx.agents.get(event.id) })
    const result = await callFork(ctx, agent, { provider: 'beta', model: 'child-model' })
    expect(result.isError).toBe(false)
    expect(text(result)).toBe('routed answer')
    expect(child?.session.inheritedEventCount).toBe(prefix.length)
    expect(child?.session.snapshotEvents().slice(0, prefix.length)).toEqual(prefix)
    expect(beta.requests).toHaveLength(1)
    expect(beta.requests[0]).toMatchObject({ provider: 'beta', model: 'child-model', reasoningEffort: 'low' })
    const inherited = JSON.stringify(beta.requests[0]?.messages)
    expect(inherited).toContain('parent context sentinel')
    expect(inherited).toContain('parent answer')
    expect(inherited).toContain('child task')
  })

  it('inherits the parent route and effort when neither override is supplied', async () => {
    const { ctx, agent, alpha, beta } = await boot()
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'parent context' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    const result = await callFork(ctx, agent, {})
    expect(result.isError).toBe(false)
    expect(text(result)).toBe('inherited answer')
    expect(alpha.requests[1]).toMatchObject({ provider: 'alpha', model: 'parent-model', reasoningEffort: 'high' })
    expect(beta.requests).toHaveLength(0)
  })

  it('rejects incomplete and unauthorized routes before creating a fork', async () => {
    const { ctx, agent, alpha, beta } = await boot()
    const before = ctx.agents.list().length
    const incomplete = await callFork(ctx, agent, { provider: 'beta' })
    expect(incomplete.isError).toBe(true)
    expect(text(incomplete)).toContain('must be supplied together')
    const denied = await callFork(ctx, agent, { provider: 'beta', model: 'unapproved' })
    expect(denied.isError).toBe(true)
    expect(text(denied)).toContain('is not allowed for this Session')
    expect(ctx.agents.list()).toHaveLength(before)
    expect(alpha.requests).toHaveLength(0)
    expect(beta.requests).toHaveLength(0)
  })

  it('keeps fork selection hidden and rejects explicit routes for an empty Session policy', async () => {
    const { ctx, agent } = await boot(['spawn', 'fork'], false)
    const schema = ctx.tools.schemas(agent).find(row => row.name === 'subagent_fork')
    const parameters = schema?.parameters as { properties?: Record<string, unknown> } | undefined
    expect(parameters?.properties?.['provider']).toBeUndefined()
    expect(ctx.tools.schemas(agent).some(row => row.name === 'list_subagent_models')).toBe(false)
    const result = await callFork(ctx, agent, { provider: 'beta', model: 'child-model' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('child model selection is disabled')
    expect(ctx.agents.list()).toHaveLength(1)
  })

  it('refuses conflicting discovery policy in the same Agent', async () => {
    const { agent } = await boot()
    expect(() => { registerListSubagentModels(agent.ctx, agent, { routes: [{ provider: 'other', model: 'outside' }] }) })
      .toThrow('must share one Session route policy')
  })
})


describe('discovery replacement during teardown', () => {
  it('keeps discovery registered when a tools change listener attaches its replacement', async () => {
    const { ctx, agent, fibers } = await boot()
    await fibers[0]!.dispose()
    let attached = false
    ctx.on('tools/change', () => {
      if (attached || ctx.tools.schemas(agent).some(row => row.name === 'list_subagent_models')) return
      attached = true
      registerListSubagentModels(agent.ctx, agent, { routes })
    })
    await fibers[1]!.dispose()
    expect(attached).toBe(true)
    expect(ctx.tools.schemas(agent).filter(row => row.name === 'list_subagent_models')).toHaveLength(1)
  })
})
