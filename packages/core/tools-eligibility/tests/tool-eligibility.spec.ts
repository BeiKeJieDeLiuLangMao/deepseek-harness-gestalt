import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import ToolEligibilityService, {
  Config,
  TOOL_ELIGIBILITY_SETTINGS_NAMESPACE,
} from '../src/index.ts'

const signal = new AbortController().signal

/** Writable in-memory settings provider for live-update coverage. */
class MemorySettings extends SettingsProvider {
  private doc: Record<string, unknown>

  constructor(ctx: Context, doc: Record<string, unknown>) {
    super(ctx)
    this.doc = structuredClone(doc)
  }

  get writable(): boolean { return true }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

function tool(name: string, execute = vi.fn(() => Promise.resolve(name))): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute,
  }
}

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(AgentRegistry)
  ctx.provide('workspaceRegistry', {
    list: () => [{ id: WorkspaceId('workspace-1'), path: '/workspace' }],
  } as never)
  await ctx.plugin(MemorySettings, {
    [TOOL_ELIGIBILITY_SETTINGS_NAMESPACE]: {
      workspaces: { 'workspace-1': ['workspace-tool'] },
      sessions: { 'session-1': ['session-tool'] },
    },
  })
  await ctx.plugin(ToolEligibilityService, { workspaces: {}, sessions: {} })

  const preset = { kind: 'preset' }
  let presetCtx!: Context
  let agentCtx!: Context
  const id = SessionId('session-1')
  const session = Session.create(id, [], { version: 0, id, createdAt: 0, cwd: '/workspace' })
  const agent = { id, session } as Agent
  await ctx.plugin(Object.assign((inner: Context) => {
    presetCtx = createScope(inner, preset).ctx
    agentCtx = createScope(inner, agent, { parent: preset }).ctx
  }, { inject: ['tools', 'systemPrompt'] }))
  Object.assign(agent, { ctx: agentCtx, status: 'idle' })
  presetCtx.tools.allowEligible(['preset-tool', 'late-tool'])
  return { agent, ctx }
}

describe('allow-only tool eligibility', () => {
  it('unions preset, Workspace, and Session additions for schemas and execution', async () => {
    const { agent, ctx } = await harness()
    const blockedBody = vi.fn(() => Promise.resolve('blocked'))
    for (const definition of [
      tool('preset-tool'),
      tool('workspace-tool'),
      tool('session-tool'),
      tool('blocked-tool', blockedBody),
    ]) ctx.tools.register(definition)

    ctx.agents.register(agent)

    expect(ctx.toolEligibility.resolve(agent)).toMatchObject({
      allow: ['late-tool', 'preset-tool', 'session-tool', 'workspace-tool'],
    })
    expect(ctx.tools.schemas(agent).map(schema => schema.name).sort()).toEqual([
      'preset-tool',
      'session-tool',
      'workspace-tool',
    ])

    const blocked = await ctx.tools.execute({
      agent,
      callId: CallId('blocked-call'),
      name: 'blocked-tool',
      arguments: {},
      signal,
    })
    expect(blocked.content).toEqual([{ type: 'text', text: 'Error: unknown tool "blocked-tool"' }])
    expect(blockedBody).not.toHaveBeenCalled()
  })

  it('recompiles dynamic tools and applies live allow-only settings updates', async () => {
    const { agent, ctx } = await harness()
    for (const name of ['preset-tool', 'workspace-tool', 'session-tool', 'blocked-tool']) {
      ctx.tools.register(tool(name))
    }
    ctx.agents.register(agent)

    ctx.tools.register(tool('late-tool'))
    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toContain('late-tool')

    await ctx.settings.update(TOOL_ELIGIBILITY_SETTINGS_NAMESPACE, {
      sessions: { 'session-1': ['session-tool', 'blocked-tool'] },
    })
    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toContain('blocked-tool')
  })

  it('exposes no user-facing deny field', () => {
    const schema = JSON.stringify(Config.toJSON())
    expect(schema).toContain('workspaces')
    expect(schema).toContain('sessions')
    expect(schema).not.toContain('deny')
    expect(() => Config({ workspaces: {}, sessions: { 'session-1': [''] } })).toThrow()
  })
})
