import { describe, expect, it } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
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
  onEffect?: (fn: () => () => void) => void
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
    effect: (fn: () => () => void) => { options.onEffect?.(fn) },
  } as unknown as ClientContext
}

describe('ui-workspace-reference apply', () => {
  it('mounts the search Remote and registers the workspace source', async () => {
    const sources: string[] = []
    let disposed = false
    let disposeEffect: (() => void) | undefined
    await apply(stubCtx({
      search: async () => ({ ok: true, value: [] }),
      onSource: (source) => {
        sources.push(source.name)
        void source.candidates({ sessionId: 's1' }, { query: '', signal: new AbortController().signal })
        return () => {}
      },
      onEffect: (fn) => { disposeEffect = fn() },
      onDisposeMount: () => { disposed = true },
    }))
    expect(sources).toEqual(['workspace'])
    expect(disposed).toBe(false)
    disposeEffect?.()
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
})
