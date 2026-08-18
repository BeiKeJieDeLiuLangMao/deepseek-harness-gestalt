import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { apply, Config, inject, name } from '../src/index.ts'

/** Mount the preset row under one scope and return the key it configures. */
async function mount(config: Config) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
  const agent = { id: SessionId('eligible') } as Agent
  let inner!: Context
  await ctx.plugin(Object.assign((host: Context) => {
    inner = createScope(host, agent).ctx
  }, { inject: ['tools', 'systemPrompt'] }))
  const row = inner.plugin({ name, inject: [...inject], Config, apply }, config)
  await row.await()
  return { agent, ctx, row }
}

describe('the agent tool-eligibility row', () => {
  it('declares only positive allowance entries for its scope', async () => {
    const { agent, ctx } = await mount({
      allow: ['mcp__browser__navigate', 'mcp__browser__screenshot'],
    })

    expect(ctx.tools.eligibilityAllow(agent)).toEqual([
      'mcp__browser__navigate',
      'mcp__browser__screenshot',
    ])
    const schema = JSON.stringify(Config.toJSON())
    expect(schema).toContain('allow')
    expect(schema).not.toContain('deny')
  })

  it('preserves explicit allow-nothing and unwinds with the row', async () => {
    const { agent, ctx, row } = await mount({ allow: [] })

    expect(ctx.tools.eligibilityAllow(agent)).toEqual([])
    await row.dispose()
    expect(ctx.tools.eligibilityAllow(agent)).toBeUndefined()
  })

  it('requires allow instead of materializing an unrestricted no-op', () => {
    expect(() => Config({} as never)).toThrow()
  })
})
