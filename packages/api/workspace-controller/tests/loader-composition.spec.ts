import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import WorkspaceController from '../src/index.ts'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

describe('workspace-controller Loader composition', () => {
  it('boots a row with no config', async () => {
    const ctx = new Context()
    context = ctx
    const dispose = (): void => {}
    ctx.provide('typert', {
      lookups: { configure: () => dispose },
      contexts: { configureHost: () => dispose },
    } as never)
    ctx.provide('workspaceRegistry', {
      list: () => [],
      archivedSessionIds: [],
    } as never)
    await ctx.plugin(Loader)
    ctx.loader.builtins['workspace-controller'] = WorkspaceController

    await ctx.loader.create({
      name: 'cordis:workspace-controller',
    })
    await ctx.loader.await()

    expect(ctx.get('workspaceController')).toBeInstanceOf(WorkspaceController)
  })
})
