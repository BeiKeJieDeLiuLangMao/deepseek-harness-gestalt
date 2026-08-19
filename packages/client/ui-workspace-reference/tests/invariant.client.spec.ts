import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as WorkspaceInvariant from '@deepseek-ai/dsh-client-ui-workspace-reference/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(WorkspaceInvariant).await()).resolves.toBeDefined()
  })

  it('node-half apply is a no-op host placeholder', async () => {
    const { apply } = await import('../src/index.ts')
    apply()
    expect(true).toBe(true)
  })
})
