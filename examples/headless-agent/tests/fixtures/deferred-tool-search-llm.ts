/** Deterministic adapter for the deferred-tool Loader snapshot. */

import type { Context } from '@deepseek-ai/cordis'
import {
  CallId,
  LlmAdapter,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class DeferredToolSearchAdapter extends LlmAdapter {
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const results = options.messages.flatMap(message =>
      message.content.filter(block => block.type === 'tool-result'))
    const weatherResult = results.find(result => result.toolCallId === 'weather-1')
    if (weatherResult !== undefined) {
      assertToolNames(options, ['tool_search', 'weather_lookup'])
      yield* textResponse('Deferred tool round trip complete.')
      return
    }
    const searchResult = results.find(result => result.toolCallId === 'search-1')
    if (searchResult !== undefined) {
      assertToolNames(options, ['tool_search', 'weather_lookup'])
      if (searchResult.discoveredTools?.map(tool => tool.name).join(',') !== 'weather_lookup') {
        throw new Error('deferred snapshot: search result did not reconstruct weather_lookup')
      }
      yield* toolCallResponse('weather-1', 'weather_lookup', { city: 'Hangzhou' })
      return
    }
    assertToolNames(options, ['tool_search'])
    yield* toolCallResponse('search-1', 'tool_search', { query: 'weather' })
  }
}

/** Fail the real composition when request-visible schemas diverge. */
function assertToolNames(options: GenerateOptions, expected: string[]): void {
  const actual = options.tools?.map(tool => tool.name) ?? []
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`deferred snapshot: expected tools ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

/** Emit one complete tool call. */
function* toolCallResponse(rawCallId: string, name: string, args: object): Generator<StreamChunk> {
  const id = CallId(rawCallId)
  const argumentsJson = JSON.stringify(args)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } }
  yield { type: 'usage', usage: { inputTokens: 4, outputTokens: 2 } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}

/** Emit one complete text response. */
function* textResponse(text: string): Generator<StreamChunk> {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  yield { type: 'usage', usage: { inputTokens: 6, outputTokens: 3 } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

export const name = 'deferred-tool-search-llm-fixture'
export const inject = ['llm']

/** Register the deterministic adapter used by the keyless snapshot. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['deferred-snapshot'], new DeferredToolSearchAdapter())
}
