import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'

function tool(name: string): ToolDefinition {
  return {
    name,
    description: `tool ${name}`,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: () => Promise.resolve(name),
  }
}

describe('session.toolEligibility', () => {
  it('projects the resolver catalog through the Host API', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    ctx.tools.register(tool('read'))
    ctx.tools.register(tool('write'))
    const session = ctx.sessions.create()
    const agent = { id: session.id, session, status: 'idle', ctx } as Agent
    ctx.agents.register(agent)
    ctx.provide('toolEligibility', {
      resolve: () => ({ allow: ['read'], tools: ctx.tools.schemas().filter(schema => schema.name === 'read') }),
    } as never)
    const api = createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'test', model: 'test' }),
      cwd: '/tmp',
    })

    const response = await api.sessions.toolEligibility({
      rpcId: RpcId('eligibility-1'),
      payload: { sessionId: session.id },
    })

    expect(response).toEqual({
      rpcId: RpcId('eligibility-1'),
      result: {
        ok: true,
        value: {
          allow: ['read'],
          tools: [{
            name: 'read',
            description: 'tool read',
            parameters: { type: 'object', properties: {} },
          }],
        },
      },
    })
  })
})
