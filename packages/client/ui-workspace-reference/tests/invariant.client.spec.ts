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

  it('node-half apply registers the settings namespace when settings is present', async () => {
    const { apply } = await import('../src/index.ts')
    const registered: string[] = []
    apply({
      inject: (_deps: string[], fn: (ctx: { settings: { register: (ns: string) => void } }) => void) => {
        fn({ settings: { register: (ns: string) => { registered.push(ns) } } })
      },
    } as never)
    expect(registered).toEqual(['workspace-reference'])
  })
})
