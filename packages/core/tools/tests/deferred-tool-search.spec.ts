import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { CodeRuntime } from '@deepseek-ai/dsh-code-runtime'
import type { CodeRunRequest, CodeRunResult } from '@deepseek-ai/dsh-code-runtime'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { RUN_CODE_NAME } from '@deepseek-ai/dsh-tools'
import type { Config, ToolDefinition } from '@deepseek-ai/dsh-tools'

const TEST_MAX_RESULT_BYTES = 64 * 1024

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

async function mount(config: Config = { toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES } }): Promise<Context> {
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
    new ToolRuntime(ctx, { toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES } })
    const schema = ctx.tools.schemas().find(candidate => candidate.name === 'tool_search')
    expect(schema?.parameters).toMatchObject({
      properties: {
        limit: { maximum: 10, description: 'Maximum matches to return (default 5).' },
      },
    })
  })

  it.each([
    [{}, /maxResultBytes must be a positive integer/],
    [{ maxResultBytes: 0 }, /maxResultBytes must be a positive integer/],
    [{ maxResultBytes: 1.5 }, /maxResultBytes must be a positive integer/],
    [{ maxResultBytes: TEST_MAX_RESULT_BYTES, maxResults: 0 }, /maxResults must be a positive integer/],
    [{ maxResultBytes: TEST_MAX_RESULT_BYTES, maxResults: 1.5 }, /maxResults must be a positive integer/],
    [{ maxResultBytes: TEST_MAX_RESULT_BYTES, maxResults: 2, defaultLimit: 0 }, /defaultLimit must be a positive integer/],
    [{ maxResultBytes: TEST_MAX_RESULT_BYTES, maxResults: 2, defaultLimit: 1.5 }, /defaultLimit must be a positive integer/],
    [{ maxResultBytes: TEST_MAX_RESULT_BYTES, maxResults: 2, defaultLimit: 3 }, /defaultLimit must be a positive integer/],
  ] as const)('rejects invalid direct-construction limits %#', async (toolSearch, message) => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    expect(() => new ToolRuntime(ctx, {
      toolSearch: toolSearch as Exclude<Config['toolSearch'], undefined>,
    })).toThrow(message)
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

  it.each([
    [null, 'non-object arguments'],
    [{ query: 42 }, 'query type'],
    [{ query: '' }, 'empty query'],
    [{ query: '   ' }, 'blank query'],
    [{ query: 'weather', unexpected: true }, 'unexpected property'],
    [{ query: 'weather', limit: '3' }, 'limit type'],
    [{ query: 'weather', limit: -1 }, 'negative limit'],
    [{ query: 'weather', limit: 0 }, 'zero limit'],
    [{ query: 'weather', limit: 1.5 }, 'fractional limit'],
    [{ query: 'weather', limit: 999 }, 'limit above configured maximum'],
  ] as const)('rejects invalid model search arguments: %s', async (arguments_, _case) => {
    const ctx = await mount({ toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES, maxResults: 3, defaultLimit: 2 } })
    for (let index = 0; index < 8; index += 1) {
      ctx.tools.register(tool(`weather_${index}`, `Weather forecast source ${index}`, true))
    }

    await expect(ctx.tools.execute({
      callId: CallId('invalid-search'),
      name: 'tool_search',
      arguments: arguments_,
      signal,
    })).resolves.toMatchObject({
      isError: true,
      error: { info: { code: 'INVALID_ARGS' } },
    })
  })

  it('enforces the configured search result cap at the model boundary', async () => {
    const ctx = await mount({ toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES, maxResults: 3, defaultLimit: 2 } })
    for (let index = 0; index < 8; index += 1) {
      ctx.tools.register(tool(`weather_${index}`, `Weather forecast source ${index}`, true))
    }

    const result = await ctx.tools.execute({
      callId: CallId('capped-search'),
      name: 'tool_search',
      arguments: { query: 'weather', limit: 3 },
      signal,
    })

    expect(result).toMatchObject({ isError: false })
    if (result.isError) throw new Error('expected tool search success')
    expect(result.loadedTools).toHaveLength(3)
  })

  it.each([
    ['one huge description', [tool('weather_huge', `Weather ${'description '.repeat(200)}`, true)]],
    ['one huge parameter schema', [{
      ...tool('weather_parameters', 'Weather parameters', true),
      parameters: {
        type: 'object',
        properties: { value: { type: 'string', description: `Weather ${'parameter '.repeat(200)}` } },
        additionalProperties: false,
      },
    }]],
    ['multiple schemas whose aggregate exceeds the budget', Array.from({ length: 4 }, (_, index) => (
      tool(`weather_${index}`, `Weather ${String(index)} ${'forecast '.repeat(20)}`, true)
    ))],
  ] as const)('rejects %s when the complete discovery result exceeds maxResultBytes', async (_case, definitions) => {
    const ctx = await mount({ toolSearch: { maxResultBytes: 800, maxResults: 10, defaultLimit: 10 } })
    for (const definition of definitions) ctx.tools.register(definition)

    await expect(ctx.tools.execute({
      callId: CallId('oversize-search'),
      name: 'tool_search',
      arguments: { query: 'weather' },
      signal,
    })).resolves.toMatchObject({
      isError: true,
      error: { info: { code: 'TOOL_SEARCH_RESULT_TOO_LARGE' } },
    })
  })

  it.each(['value', 'content', 'error'] as const)(
    'clears discovery metadata when post-execute replaces the committed %s',
    async (replacement) => {
      const ctx = await mount()
      ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather by city', true))
      ctx.on('tools/post-execute', async () => {
        if (replacement === 'value') return { kind: 'accept', value: [] }
        if (replacement === 'content') {
          return { kind: 'accept', content: [{ type: 'text' as const, text: 'policy replaced search content' }] }
        }
        return { kind: 'block', feedback: [{ type: 'text' as const, text: 'search result blocked' }] }
      })

      const result = await ctx.tools.execute({
        callId: CallId(`post-replaced-${replacement}`),
        name: 'tool_search',
        arguments: { query: 'weather forecast' },
        signal,
      })

      expect('loadedTools' in result ? result.loadedTools : undefined).toBeUndefined()
      if (replacement === 'content') {
        expect(result).toMatchObject({
          isError: false,
          value: [{ name: 'mcp__weather__forecast' }],
          content: [{ type: 'text', text: 'policy replaced search content' }],
        })
      } else if (replacement === 'error') {
        expect(result).toMatchObject({ isError: true, error: { message: 'search result blocked' } })
      } else {
        expect(result).toMatchObject({ isError: false, value: [], content: [{ type: 'text', text: '[]' }] })
      }
    },
  )

  it.each(['value', 'error'] as const)(
    'clears discovery metadata when around-execute replaces the committed %s',
    async (replacement) => {
      const ctx = await mount()
      ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather by city', true))
      ctx.on('tools/execute', async (_exec, next) => {
        await next()
        if (replacement === 'error') {
          return {
            isError: true as const,
            error: { message: 'around policy rejected search' },
            content: [{ type: 'text' as const, text: 'around policy rejected search' }],
          }
        }
        return {
          isError: false as const,
          value: [],
          content: [{ type: 'text' as const, text: 'around replacement' }],
        }
      })

      const result = await ctx.tools.execute({
        callId: CallId(`around-replaced-${replacement}`),
        name: 'tool_search',
        arguments: { query: 'weather forecast' },
        signal,
      })

      expect('loadedTools' in result ? result.loadedTools : undefined).toBeUndefined()
      expect(result.isError).toBe(replacement === 'error')
    },
  )

  it('reconstructs discovered schemas from the durable result on the next request', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather by city', true))
    ctx.tools.register(tool('mcp__calendar__list', 'List calendar events', true))
    const session = Session.create(SessionId('deferred-search'))
    const agent = { session } as Agent
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'Find a weather tool.' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })

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

  it.each([
    [null, 'non-object schema'],
    [{ name: 'mcp__weather__forecast', description: 'Forecast weather' }, 'missing field'],
    [{ name: '', description: 'Forecast weather', parameters: { type: 'object' } }, 'empty name'],
    [{ name: 'mcp__weather__forecast', description: 42, parameters: { type: 'object' } }, 'description'],
    [{ name: 'mcp__weather__forecast', description: 'Forecast weather', parameters: null }, 'parameters'],
    [{
      name: 'mcp__weather__forecast',
      description: 'Forecast weather',
      parameters: { type: 'object', properties: { city: { type: 'unknown' } } },
    }, 'nested parameter schema'],
  ] as const)('rejects restored loadedTools with malformed %s', async (malformed, _case) => {
    const ctx = await mount()
    ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather', true))
    const persisted = Session.create(SessionId('malformed-loaded-tool'))
    persisted.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId('search-malformed'),
        content: [{ type: 'text', text: 'malformed durable discovery' }],
        isError: false,
        loadedTools: [malformed] as never,
      }),
    }, { surfaceOp: 'append' })
    const restored = Session.create(
      SessionId(`restored-${_case}`),
      JSON.parse(JSON.stringify(persisted.events)) as never,
    )
    const agent = { session: restored } as Agent

    await expect(ctx.systemPrompt.assemble({ scope: agent, agent }))
      .rejects.toThrow(/durable loadedTools/)
  })

  it.each(['native', 'both'] as const)('accepts visible tool_search in toolOrder under mode %s', async (mode) => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, { toolOrder: ['tool_search', '<unlisted-tools>'] })
    await ctx.plugin(ToolRuntime, { mode, toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES } })
    if (mode === 'both') await ctx.plugin(FakeRuntime)
    ctx.tools.register(tool('echo', 'Echo a value'))

    expect((await ctx.systemPrompt.assemble()).tools.map(schema => schema.name)[0]).toBe('tool_search')
    expect(() => ctx.tools.register(tool('tool_search', 'Shadow reserved discovery')))
      .toThrow(/reserved for deferred schema discovery/)
  })

  it('keeps code mode ordering limited to its actual run_code wire schema', async () => {
    const valid = new Context()
    await valid.plugin(SystemPrompt, { toolOrder: [RUN_CODE_NAME, '<unlisted-tools>'] })
    await valid.plugin(ToolRuntime, { mode: 'code', toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES } })
    await valid.plugin(FakeRuntime)
    expect((await valid.systemPrompt.assemble()).tools.map(schema => schema.name)).toEqual([RUN_CODE_NAME])

    const invalid = new Context()
    await invalid.plugin(SystemPrompt, { toolOrder: ['tool_search', '<unlisted-tools>'] })
    await invalid.plugin(ToolRuntime, { mode: 'code', toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES } })
    await invalid.plugin(FakeRuntime)
    await expect(invalid.systemPrompt.assemble())
      .rejects.toThrow(/toolOrder lists unregistered tool "tool_search"/)
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
    const ctx = await mount({ mode: 'code', toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES } })
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

    let nextRunBindings: string[] = []
    runtime.behavior = async (request) => {
      nextRunBindings = Object.keys(request.bindings[0]!.functions).sort()
      const forecast = request.bindings[0]!.functions.mcp__weather__forecast
      if (forecast === undefined) throw new Error('weather binding missing from reconstructed program')
      const value = await forecast({ value: 'Shanghai' })
      return { logs: [], value }
    }
    const nextRun = await ctx.tools.execute({
      callId: CallId('run-code-weather'),
      name: 'run_code',
      arguments: { code: 'await tools.mcp__weather__forecast({ value: "Shanghai" })', description: 'Read the weather forecast' },
      agent,
      signal,
    })
    expect(nextRun).toMatchObject({ isError: false })
    expect(nextRunBindings).toEqual(['mcp__weather__forecast', 'tool_search'])
  })

  it('removes a reconstructed Code Mode binding when eligibility becomes stale', async () => {
    const ctx = await mount({ mode: 'code', toolSearch: { maxResultBytes: TEST_MAX_RESULT_BYTES } })
    ctx.tools.register(tool('mcp__weather__forecast', 'Forecast weather by city', true))
    ctx.tools.register(tool('mcp__calendar__list', 'List calendar events', true))
    const session = Session.create(SessionId('deferred-code-mode-stale'))
    const { agent, scope } = await scopedAgent(ctx, session)
    const removeWeatherEligibility = scope.ctx.tools.allowEligible(['mcp__weather__forecast'])
    const runtime = ctx.codeRuntime as FakeRuntime
    runtime.behavior = async (request) => {
      await request.bindings[0]!.functions.tool_search?.({ query: 'weather forecast' })
      return { logs: [] }
    }
    const search = await ctx.tools.execute({
      callId: CallId('run-code-stale-search'),
      name: 'run_code',
      arguments: { code: 'await tools.tool_search({ query: "weather forecast" })', description: 'Find the weather tool' },
      agent,
      signal,
    })
    if (search.isError) throw new Error('expected run_code search success')
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId('run-code-stale-search'),
        content: search.content,
        isError: false,
        loadedTools: search.loadedTools ?? [],
      }),
    }, { surfaceOp: 'append' })

    removeWeatherEligibility()
    scope.ctx.tools.allowEligible(['mcp__calendar__list'])
    let nextRunBindings: string[] = []
    runtime.behavior = async (request) => {
      nextRunBindings = Object.keys(request.bindings[0]!.functions).sort()
      return { logs: [] }
    }
    await ctx.tools.execute({
      callId: CallId('run-code-after-stale'),
      name: 'run_code',
      arguments: { code: 'return Object.keys(tools)', description: 'Inspect callable tools' },
      agent,
      signal,
    })

    expect(nextRunBindings).toEqual(['tool_search'])
  })
})
