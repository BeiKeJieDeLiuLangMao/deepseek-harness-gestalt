import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { InputTriggerService } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { apply } from '../src/client/index.ts'

/** One captured slot registration: entry name plus the business-face factory. */
interface CapturedRegistration {
  name: string
  label?: () => string
  inject: (...args: never[]) => Record<string, unknown>
}

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
  onRegister?: (entry: CapturedRegistration) => void
  scope?: {
    getSnapshot: () => { value: object | undefined }
    subscribe: (fn: () => void) => () => void
    set: (field: string, value: unknown) => Promise<void>
  }
  sessions?: { list: { getSnapshot: () => { byId: Record<string, { cwd?: string }> } } }
  workspaces?: { openPath: (path: string) => Promise<void> }
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
    settingsScope: {
      bind: () => options.scope
        ?? { getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: async () => {} },
    },
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: {
      inject: (_name: string, register: () => unknown) => { register() },
      register: (entry: CapturedRegistration) => {
        options.onRegister?.(entry)
        return () => {}
      },
    },
    sessions: options.sessions ?? { list: { getSnapshot: () => ({ byId: {} }) } },
    workspaces: options.workspaces ?? { openPath: async () => {} },
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

  it('feeds one preference snapshot to both faces and routes dock opens and settings writes', async () => {
    const faces = new Map<string, CapturedRegistration>()
    const opened: string[] = []
    const writes: Array<[string, unknown]> = []
    const scopeState: { stored?: object; notify?: () => void } = {}
    await apply(stubCtx({
      search: async () => ({ ok: true, value: [] }),
      onSource: () => () => {},
      onEffect: (fn) => { fn() },
      onRegister: (entry) => { faces.set(entry.name, entry) },
      scope: {
        getSnapshot: () => ({ value: scopeState.stored }),
        subscribe: (fn) => {
          scopeState.notify = fn
          return () => {}
        },
        set: async (field, value) => { writes.push([field, value]) },
      },
      sessions: { list: { getSnapshot: () => ({ byId: { s1: { cwd: '/ws' } } }) } },
      workspaces: {
        // Rejection exercises the swallowed Host/OS open failure.
        openPath: async (path) => {
          opened.push(path)
          throw new Error('native open failed')
        },
      },
    }))

    const dock = faces.get('conversation.input.dock')?.inject('s1' as never) as {
      hooks: { settings: { getSnapshot: () => { enable: boolean } } }
      openPath: (path: string) => void
    }
    dock.openPath('README.md')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(opened).toEqual(['/ws/README.md'])

    const section = faces.get('settings.section')
    expect(section?.label?.()).toBe('nav')
    const face = section?.inject() as {
      hooks: { settings: { getSnapshot: () => { enable: boolean } } }
      setField: (field: string, value: boolean | string) => void
    }
    face.setField('enable', false)
    expect(writes).toEqual([['enable', false]])

    // Both faces read the same live snapshot; a scope change moves them together.
    expect(dock.hooks.settings.getSnapshot().enable).toBe(true)
    scopeState.stored = { enable: false }
    scopeState.notify?.()
    expect(dock.hooks.settings.getSnapshot().enable).toBe(false)
    expect(face.hooks.settings.getSnapshot().enable).toBe(false)
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
