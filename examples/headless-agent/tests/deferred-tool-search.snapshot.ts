/** Keyless assembled-loop snapshot for durable deferred tool discovery. */

import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, {
  CallId,
  createUserMessage,
  LlmAdapter,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'

function toolCall(id: string, name: string, args: object): StreamChunk[] {
  const callId = CallId(id)
  const argumentsJson = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: argumentsJson },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: argumentsJson } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function text(textValue: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: textValue },
    { type: 'block-end', index: 0, block: { type: 'text', text: textValue } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: StreamChunk[][]) {
    super()
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const response = this.script.shift()
    if (response === undefined) throw new Error('deferred-tool-search snapshot script exhausted')
    for (const chunk of response) yield chunk
  }
}

async function harness(adapter: ScriptedAdapter): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: 'Deferred tool search snapshot.' })
  await ctx.plugin(ToolRuntime, { toolSearch: { defaultLimit: 3, maxResults: 5 } })
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['snapshot'], adapter)
  return ctx
}

function forecastTool(): ToolDefinition {
  return {
    name: 'mcp__weather__forecast',
    description: 'Forecast weather by city.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    },
    deferLoading: true,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: args => Promise.resolve(`sunny:${(args as { city: string }).city}`),
  }
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      dispose()
      resolve()
    })
  })
}

function send(agent: Agent, value: string): void {
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: value }],
    source: { kind: 'user' },
  }))
}

function requestSummary(request: GenerateOptions): object {
  return {
    tools: request.tools?.map(tool => tool.name),
    messages: request.messages.flatMap(message => message.content.map((block) => {
      switch (block.type) {
        case 'text': return `${message.role}:text:${block.text}`
        case 'tool-call': return `${message.role}:call:${block.name}:${block.arguments}`
        case 'tool-result': return `${message.role}:result:${block.toolCallId}:${block.content.map(content => content.type === 'text' ? content.text : content.type).join('')}:loaded=${block.loadedTools?.map(tool => tool.name).join(',') ?? ''}`
        default: return `${message.role}:${block.type}`
      }
    })),
  }
}

describe('deferred tool search assembled snapshot', () => {
  it('searches, continues, executes, and reconstructs from the session log without a key', async () => {
    const adapter = new ScriptedAdapter([
      toolCall('search-call', 'tool_search', { query: 'weather forecast' }),
      toolCall('forecast-call', 'mcp__weather__forecast', { city: 'Hangzhou' }),
      text('WEATHER DONE'),
    ])
    const ctx = await harness(adapter)
    ctx.tools.register(forecastTool())
    const agent = ctx.agentLoop.create(SessionId('deferred-search-snapshot'), {
      provider: 'snapshot',
      model: 'snapshot',
    })

    send(agent, 'Find the weather tool, call it for Hangzhou, then finish.')
    await waitForIdle(ctx, agent)

    const summary = {
      requests: adapter.requests.map(requestSummary),
      durable: agent.session.deriveMessages().flatMap(message => message.content.map((block) => {
        if (block.type === 'tool-call') return `call:${block.name}`
        if (block.type === 'tool-result') return `result:${block.toolCallId}:loaded=${block.loadedTools?.map(tool => tool.name).join(',') ?? ''}`
        if (block.type === 'text') return `${message.role}:text:${block.text}`
        return block.type
      })),
      headers: agent.session.events
        .filter(event => event.type === 'request/header')
        .map(event => ({ reason: event.data.reason, tools: event.data.header.tools?.map(tool => tool.name) ?? [] })),
    }
    expect(summary).toMatchInlineSnapshot(`
      {
        "durable": [
          "user:text:Find the weather tool, call it for Hangzhou, then finish.",
          "call:tool_search",
          "result:search-call:loaded=mcp__weather__forecast",
          "call:mcp__weather__forecast",
          "result:forecast-call:loaded=",
          "assistant:text:WEATHER DONE",
        ],
        "headers": [
          {
            "reason": "initial",
            "tools": [
              "tool_search",
            ],
          },
          {
            "reason": "change",
            "tools": [
              "mcp__weather__forecast",
              "tool_search",
            ],
          },
        ],
        "requests": [
          {
            "messages": [
              "user:text:Find the weather tool, call it for Hangzhou, then finish.",
            ],
            "tools": [
              "tool_search",
            ],
          },
          {
            "messages": [
              "user:text:Find the weather tool, call it for Hangzhou, then finish.",
              "assistant:call:tool_search:{"query":"weather forecast"}",
              "user:result:search-call:[
        {
          "name": "mcp__weather__forecast",
          "description": "Forecast weather by city.",
          "parameters": {
            "type": "object",
            "properties": {
              "city": {
                "type": "string"
              }
            },
            "required": [
              "city"
            ],
            "additionalProperties": false
          }
        }
      ]:loaded=mcp__weather__forecast",
            ],
            "tools": [
              "mcp__weather__forecast",
              "tool_search",
            ],
          },
          {
            "messages": [
              "user:text:Find the weather tool, call it for Hangzhou, then finish.",
              "assistant:call:tool_search:{"query":"weather forecast"}",
              "user:result:search-call:[
        {
          "name": "mcp__weather__forecast",
          "description": "Forecast weather by city.",
          "parameters": {
            "type": "object",
            "properties": {
              "city": {
                "type": "string"
              }
            },
            "required": [
              "city"
            ],
            "additionalProperties": false
          }
        }
      ]:loaded=mcp__weather__forecast",
              "assistant:call:mcp__weather__forecast:{"city":"Hangzhou"}",
              "user:result:forecast-call:sunny:Hangzhou:loaded=",
            ],
            "tools": [
              "mcp__weather__forecast",
              "tool_search",
            ],
          },
        ],
      }
    `)

    const resumedAdapter = new ScriptedAdapter([text('RESUMED')])
    const resumedCtx = await harness(resumedAdapter)
    resumedCtx.tools.register(forecastTool())
    const resumed = await resumedCtx.agents.create({
      sessionId: SessionId('deferred-search-resumed'),
      seed: structuredClone(agent.session.events),
      agentOptions: { provider: 'snapshot', model: 'snapshot' },
    })
    send(resumed.agent, 'Confirm the reconstructed catalog.')
    await waitForIdle(resumedCtx, resumed.agent)

    expect(resumedAdapter.requests[0]?.tools?.map(tool => tool.name))
      .toEqual(['mcp__weather__forecast', 'tool_search'])
  })
})
