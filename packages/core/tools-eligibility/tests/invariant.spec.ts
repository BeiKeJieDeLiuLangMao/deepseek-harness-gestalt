import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolEligibilityInvariant from '../src/invariant.ts'

describe('tool-eligibility relationship invariant', () => {
  it('rejects a settings publication that differs from the live registry view', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    await ctx.plugin(InvariantRegistry, {})
    await ctx.plugin(ToolEligibilityInvariant)
    const id = SessionId('invariant-session')
    const session = Session.create(id)
    const agent = { id, session, status: 'idle', ctx } as Agent

    expect(() => {
      ctx.emit('tool-eligibility/published', agent, {
        settingsAllow: ['claimed'],
        effectiveAllow: ['claimed'],
      })
    }).toThrow(/invariant violated by "@deepseek-ai\/dsh-tools-eligibility"/)

    expect(() => {
      ctx.emit('tool-eligibility/published', agent, {
        settingsAllow: ['missing'],
      })
    }).toThrow(/settings allowance "missing" is absent from the live registry/)
  })
})
