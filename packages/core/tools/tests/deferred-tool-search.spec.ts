import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { CodeRuntime } from '@deepseek-ai/dsh-code-runtime'
import type { CodeRunRequest, CodeRunResult } from '@deepseek-ai/dsh-code-runtime'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { Config, ToolDefinition } from '@deepseek-ai/dsh-tools'

const signal = new AbortController().signal

function tool(name: string, description: string, deferLoading = false): ToolDefinition {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: { value: { type: 'string' } },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: async () => name,
    deferLoading,
  }
}

class FakeRuntime extends CodeRuntime {
  readonly language = 'typescript'
  readonly isolation = 'test'
  behavior: (request: CodeRunRequest) => Promise<CodeRunResult> = () => Promise.resolve({ logs: [] })

  run(request: CodeRunRequest): Promise<CodeRunResult> {
    return this.behavior(request)
  }
}

async function mount(config: Config = { toolSearch: {} }): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, config)
  if (config.mode !== undefined && config.mode !== 'native') await ctx.plugin(FakeRuntime)
  return ctx
}

async function scopedAgent(ctx: Context, session: Session): Promise<{ agent: Agent; scope: Scope }> {
  const agent = { session } as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, agent) }, {
    inject: ['tools', 'systemPrompt'],
  }))
  return { agent, scope }
}

describe('deferred tool search', () => {
  it('applies direct-construction search defaults', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    new ToolRuntime(ctx, { toolSearch: {} })
    const schema = ctx.tools.schemas().find(candidate => candidate.name === 'tool_search')
    expect(schema?.parameters).toMatchObject({
      properties: {
        limit: { maximum: 10, description: 'Maximum matches to return (default 5).' },
      },
    })
  })

  it.each([
    [{ maxResults: 0 }, /maxResults must be a positive integer/],
    [{ maxResults: 1.5 }, /maxResults must be a positive integer/],
    [{ maxResults: 2, defaultLimit: 0 }, /defaultLimit must be a positive integer/],
    [{ maxResults: 2, defaultLimit: 1.5 }, /defaultLimit must be a positive integer/],
    [{ maxResults: 2, defaultLimit: 3 }, /defaultLimit must be a positive integer/],
  ] as const)('rejects invalid direct-construction limits %#', async (toolSearch, message) => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    expect(() => new ToolRuntime(ctx, { toolSearch })).toThrow(message)
  })

  it('reserves tool_search and rejects deferred definitions while discovery is disabled', async () => {
    const ctx = await mount({ toolSearch: false })
    expect(() => ctx.tools.register(tool('tool_search', 'shadow search'))).toThrow(/reserved for deferred schema discovery/)
    expect(() => ctx.tools.register(tool('deferred', 'hidden', true))).toThrow(/toolSearch is disabled/)
  })

  it('keeps deferred schemas out of the initial request while retaining the eligible catalog', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('read', 'Read a local file'))
    ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather by city', true))
    ctx.tools.register(tool('mcp__calendar__list', 'List calendar events', true))

    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['read', 'tool_search'])
    expect(ctx.tools.catalogSchemas().map(schema => schema.name)).toEqual([
      'read',
      'mcp__weather__forecast',
      'mcp__calendar__list',
    ])

    const result = await ctx.tools.execute({
      callId: CallId('search-1'),
      name: 'tool_search',
      arguments: { query: 'weather forecast' },
      signal,
    })

    expect(result).toMatchObject({
      isError: false,
      loadedTools: [{
        name: 'mcp__weather__forecast',
        description: 'Forecast weather by city',
      }],
    })
    expect(result.content).toEqual([{
      type: 'text',
      text: JSON.stringify(result.isError ? [] : result.loadedTools, null, 2),
    }])
  })

  it('reconstructs discovered schemas from the durable result on the next request', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather by city', true))
    ctx.tools.register(tool('mcp__calendar__list', 'List calendar events', true))
    const session = Session.create(SessionId('deferred-search'))
    const agent = { session } as Agent

    expect((await ctx.systemPrompt.assemble({ scope: agent, agent })).tools.map(schema => schema.name))
      .toEqual(['tool_search'])

    const result = await ctx.tools.execute({
      callId: CallId('search-1'),
      name: 'tool_search',
      arguments: { query: 'weather forecast' },
      agent,
      signal,
    })
    if (result.isError) throw new Error('expected tool search success')
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId('search-1'),
        content: result.content,
        isError: false,
        loadedTools: result.loadedTools ?? [],
      }),
    }, { surfaceOp: 'append' })

    const next = await ctx.systemPrompt.assemble({ scope: agent, agent })
    expect(next.tools.map(schema => schema.name)).toEqual([
      'mcp__weather__forecast',
      'tool_search',
    ])

    const resumed = Session.create(SessionId('deferred-search-resumed'), session.events)
    const resumedAgent = { session: resumed } as Agent
    expect((await ctx.systemPrompt.assemble({ scope: resumedAgent, agent: resumedAgent })).tools)
      .toEqual(next.tools)
  })

  it('drops a discovered schema when current allow-only eligibility changes', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather by city', true))
    ctx.tools.register(tool('mcp__calendar__list', 'List calendar events', true))
    const session = Session.create(SessionId('deferred-eligibility'))
    const { agent, scope } = await scopedAgent(ctx, session)
    const removeWeatherEligibility = scope.ctx.tools.allowEligible(['mcp__weather__forecast'])
    const result = await ctx.tools.execute({
      callId: CallId('search-eligibility'),
      name: 'tool_search',
      arguments: { query: 'weather forecast' },
      agent,
      signal,
    })
    if (result.isError) throw new Error('expected tool search success')
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId('search-eligibility'),
        content: result.content,
        isError: false,
        loadedTools: result.loadedTools ?? [],
      }),
    }, { surfaceOp: 'append' })

    removeWeatherEligibility()
    scope.ctx.tools.allowEligible(['mcp__calendar__list'])

    expect((await ctx.systemPrompt.assemble({ scope: agent, agent })).tools.map(schema => schema.name))
      .toEqual(['tool_search'])
    await expect(ctx.tools.execute({
      callId: CallId('stale-weather'),
      name: 'mcp__weather__forecast',
      arguments: {},
      agent,
      signal,
    })).resolves.toMatchObject({ isError: true, error: { info: { code: 'UNKNOWN_TOOL' } } })
  })

  it('reconstructs discovered schemas in the Code Mode SDK without native activation', async () => {
    const ctx = await mount({ mode: 'code', toolSearch: {} })
    ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather by city', true))
    const session = Session.create(SessionId('deferred-code-mode'))
    const agent = { session } as Agent
    const runtime = ctx.codeRuntime as FakeRuntime
    runtime.behavior = async (request) => {
      await request.bindings[0]?.functions.tool_search?.({ query: 'weather' })
      await request.bindings[0]?.functions.tool_search?.({ query: 'weather forecast' })
      return { logs: [] }
    }
    const result = await ctx.tools.execute({
      callId: CallId('run-code-search'),
      name: 'run_code',
      arguments: { code: 'await tools.tool_search({ query: "weather" })', description: 'Find the weather tool' },
      agent,
      signal,
    })
    if (result.isError) throw new Error('expected run_code success')
    expect(result.loadedTools?.map(schema => schema.name)).toEqual(['mcp__weather__forecast'])
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId('run-code-search'),
        content: result.content,
        isError: false,
        loadedTools: result.loadedTools ?? [],
      }),
    }, { surfaceOp: 'append' })

    const assembly = await ctx.systemPrompt.assemble({ scope: agent, agent })
    expect(assembly.tools.map(schema => schema.name)).toEqual(['run_code'])
    expect(assembly.sections.find(section => section.name === 'tools:sdk')?.text)
      .toContain('mcp__weather__forecast')
  })
})
