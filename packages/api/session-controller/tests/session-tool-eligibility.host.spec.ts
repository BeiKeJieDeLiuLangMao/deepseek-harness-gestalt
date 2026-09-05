import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { createSessionTestController } from './test-remote.ts'

function tool(name: string, deferLoading = false): ToolDefinition {
  return {
    name,
    description: `tool ${name}`,
    parameters: { type: 'object', properties: {} },
    deferLoading,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: () => Promise.resolve(name),
  }
}

const defaults = {
  defaultModelSelection: () => ({ provider: 'test', model: 'test' }),
  cwd: '/tmp',
}

async function bootTools(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, { toolSearch: { maxResultBytes: 65_536 } })
  return ctx
}

describe('session.toolEligibility', () => {
  it('projects the Agent-context catalog through the Session Controller', async () => {
    const ctx = await bootTools()
    ctx.tools.register(tool('read', true))
    ctx.tools.register(tool('write'))
    const session = ctx.sessions.create()
    const agent = { id: session.id, session } as Agent
    let agentCtx!: Context
    await ctx.plugin(Object.assign((inner: Context) => {
      agentCtx = createScope(inner, agent).ctx
      agentCtx.tools.allowEligible(['read'])
    }, { inject: ['tools'] }))
    Object.assign(agent, { status: 'idle', ctx: agentCtx })
    ctx.agents.register(agent)
    const controller = createSessionTestController(ctx, defaults)

    await expect(controller.toolEligibility({ sessionId: session.id })).resolves.toEqual({
      allow: ['read'],
      tools: [{
        name: 'read',
        description: 'tool read',
        parameters: { type: 'object', properties: {} },
      }],
    })
  })

  it('omits allow when no allow-only policy is active and includes the visible catalog', async () => {
    const ctx = await bootTools()
    ctx.tools.register(tool('read'))
    ctx.tools.register(tool('write'))
    const session = ctx.sessions.create()
    const agent = { id: session.id, session, status: 'idle', ctx } as Agent
    ctx.agents.register(agent)
    const controller = createSessionTestController(ctx, defaults)

    await expect(controller.toolEligibility({ sessionId: session.id })).resolves.toEqual({
      tools: [
        { name: 'read', description: 'tool read', parameters: { type: 'object', properties: {} } },
        { name: 'write', description: 'tool write', parameters: { type: 'object', properties: {} } },
      ],
    })
  })

  it('keeps an empty allow list when the composition allows no end tool', async () => {
    const ctx = await bootTools()
    ctx.tools.register(tool('read'))
    const session = ctx.sessions.create()
    const agent = { id: session.id, session } as Agent
    let agentCtx!: Context
    await ctx.plugin(Object.assign((inner: Context) => {
      agentCtx = createScope(inner, agent).ctx
      agentCtx.tools.allowEligible([])
    }, { inject: ['tools'] }))
    Object.assign(agent, { status: 'idle', ctx: agentCtx })
    ctx.agents.register(agent)
    const controller = createSessionTestController(ctx, defaults)

    await expect(controller.toolEligibility({ sessionId: session.id })).resolves.toEqual({
      allow: [],
      tools: [],
    })
  })

  it('fails when the Tools service is not mounted', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    const session = ctx.sessions.create()
    const agent = { id: session.id, session, status: 'idle', ctx } as Agent
    ctx.agents.register(agent)
    const controller = createSessionTestController(ctx, defaults)

    await expect(controller.toolEligibility({ sessionId: session.id })).rejects.toBeInstanceOf(RemoteError)
  })
})
