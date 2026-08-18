import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type Agent } from '@deepseek-ai/dsh-agent'
import type { EpochHeader } from '@deepseek-ai/dsh-session'
import { inheritParentAgentRoute, resolveChildAgentOptions } from '../src/child-agent.ts'

function parent(input: {
  options: Agent['options']
  logged?: EpochHeader['config']
  live?: { provider: string; model: string }
}): Agent {
  const ctx = new Context()
  if (input.live !== undefined) {
    installModelSelection(ctx, { current: input.live, assembled: undefined })
  }
  return {
    ctx,
    options: input.options,
    session: {
      requestHeader: () => input.logged === undefined ? undefined : { config: input.logged },
    },
  } as Agent
}

describe('inheritParentAgentRoute', () => {
  it('prefers the live session selection over creation-time AgentOptions', () => {
    expect(inheritParentAgentRoute(parent({
      options: { provider: 'glm', model: 'glm-old' },
      live: { provider: 'grok', model: 'grok-4' },
    }))).toEqual({ provider: 'grok', model: 'grok-4' })
  })

  it('falls back to the latest logged request header when no live selection is installed', () => {
    expect(inheritParentAgentRoute(parent({
      options: { provider: 'glm', model: 'glm-old' },
      logged: { provider: 'grok', model: 'grok-4' },
    }))).toEqual({ provider: 'grok', model: 'grok-4' })
  })

  it('uses creation-time AgentOptions when neither live selection nor a header exists', () => {
    expect(inheritParentAgentRoute(parent({
      options: { provider: 'glm', model: 'glm-old', maxTokens: 1024 },
    }))).toEqual({ provider: 'glm', model: 'glm-old', maxTokens: 1024 })
  })

  it('falls through an installed empty live selection to the logged header', () => {
    const ctx = new Context()
    installModelSelection(ctx, { current: undefined, assembled: undefined })
    const agent = {
      ctx,
      options: { provider: 'glm', model: 'glm-old' },
      session: {
        requestHeader: () => ({ config: { provider: 'grok', model: 'grok-4' } }),
      },
    } as Agent
    expect(inheritParentAgentRoute(agent)).toEqual({ provider: 'grok', model: 'grok-4' })
  })

  it('omits absent route fields', () => {
    expect(inheritParentAgentRoute(parent({ options: {} }))).toEqual({})
  })
})

describe('resolveChildAgentOptions', () => {
  it('lets an explicit child override still win over the live parent route', () => {
    expect(resolveChildAgentOptions(
      parent({
        options: { provider: 'glm', model: 'glm-old' },
        live: { provider: 'grok', model: 'grok-4' },
      }),
      { model: 'child-model' },
      1,
    )).toEqual({ provider: 'grok', model: 'child-model', subagentDepth: 1 })
  })
})
