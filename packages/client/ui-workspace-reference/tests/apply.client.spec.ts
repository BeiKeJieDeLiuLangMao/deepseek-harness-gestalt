import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { InputTriggerService } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { apply } from '../src/client/index.ts'

function stubCtx(options: {
  search: () => Promise<{ ok: true; value: readonly unknown[] } | { ok: false; error: { code: string; message: string; details: object } }>
  onSource: (source: {
    name: string
    candidates: (
      session: { sessionId: string },
      req: { query: string; signal: AbortSignal },
    ) => Promise<unknown>
  }) => () => void
  onEffect?: (fn: () => () => void | Promise<void>) => void
  onDisposeMount?: () => void
}): ClientContext {
  return {
    remote: {
      $mount: async () => async () => { options.onDisposeMount?.() },
    },
    get: (key: string) => {
      if (key === 'remote.workspaceReference') return { search: options.search }
      return { registerSource: options.onSource }
    },
    effect: (fn: () => () => void | Promise<void>) => { options.onEffect?.(fn) },
    settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: async () => {} }) },
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: () => {} },
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    workspaces: { openPath: async () => {} },
  } as unknown as ClientContext
}

describe('ui-workspace-reference apply', () => {
  it('mounts the search Remote and registers the workspace source', async () => {
    const sources: string[] = []
    let disposed = false
    const disposers: Array<(() => void | Promise<void>) | undefined> = []
    await apply(stubCtx({
      search: async () => ({ ok: true, value: [] }),
      onSource: (source) => {
        sources.push(source.name)
        void source.candidates({ sessionId: 's1' }, { query: '', signal: new AbortController().signal })
        return () => {}
      },
      onEffect: (fn) => { disposers.push(fn()) },
      onDisposeMount: () => { disposed = true },
    }))
    expect(sources).toEqual(['workspace'])
    expect(disposed).toBe(false)
    for (const dispose of disposers) void dispose?.()
    expect(disposed).toBe(true)
  })

  it('surfaces a failed search Remote as an Error', async () => {
    let thrown: unknown
    await apply(stubCtx({
      search: async () => ({ ok: false, error: { code: 'rpc', message: 'down', details: {} } }),
      onSource: (source) => {
        void source.candidates(
          { sessionId: 's1' },
          { query: '', signal: new AbortController().signal },
        ).catch((error: unknown) => { thrown = error })
        return () => {}
      },
      onEffect: (fn) => { fn() },
    }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('down')
  })

  it('registers the @ workspace source; disposal frees the name', async () => {
    const ctx = new Context()
    ctx.provide('sessions', { list: { getSnapshot: () => ({ byId: {} }) } })
    ctx.provide('workspaces', { openPath: async () => {} })
    ctx.provide('settingsScope', {
      bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: async () => {} }),
    })
    ctx.provide('locale', { register: () => () => {}, bind: () => (key: string) => key })
    ctx.provide('slots', { inject: () => {} })
    await ctx.plugin(InputTriggerService).await()
    ctx.provide('remote', { $mount: async () => async () => {} })
    ctx.provide('remote.workspaceReference', {
      search: async () => ({ ok: true, value: [] }),
    })
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const inputTriggers = ctx.get('inputTriggers') as InputTriggerService
    const rival = {
      trigger: '@' as const,
      name: 'workspace',
      candidates: () => Promise.resolve([]),
      onPick: () => undefined,
    }
    expect(() => inputTriggers.registerSource(rival)).toThrow(/already registered/)
    await fiber.dispose()
    expect(() => inputTriggers.registerSource(rival)).not.toThrow()
  })
})
