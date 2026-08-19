import { describe, expect, it } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { apply } from '../src/client/index.ts'

describe('ui-workspace-reference apply', () => {
  it('mounts the search Remote and registers the workspace source', async () => {
    const sources: string[] = []
    let disposed = false
    let disposeEffect: (() => void) | undefined
    const ctx = {
      remote: {
        $mount: async () => async () => { disposed = true },
        workspaceReference: {
          search: async () => ({ ok: true, value: [] }),
        },
      },
      get: () => ({
        registerSource: (source: {
          name: string
          candidates: (
            session: { sessionId: string },
            req: { query: string; signal: AbortSignal },
          ) => Promise<unknown>
        }) => {
          sources.push(source.name)
          void source.candidates({ sessionId: 's1' }, { query: '', signal: new AbortController().signal })
          return () => {}
        },
      }),
      effect: (fn: () => () => void) => { disposeEffect = fn() },
    } as unknown as ClientContext
    await apply(ctx)
    expect(sources).toEqual(['workspace'])
    expect(disposed).toBe(false)
    disposeEffect?.()
    expect(disposed).toBe(true)
  })

  it('surfaces a failed search Remote as an Error', async () => {
    let thrown: unknown
    const ctx = {
      remote: {
        $mount: async () => async () => {},
        workspaceReference: {
          search: async () => ({ ok: false, error: { code: 'rpc', message: 'down', details: {} } }),
        },
      },
      get: () => ({
        registerSource: (source: {
          candidates: (
            session: { sessionId: string },
            req: { query: string; signal: AbortSignal },
          ) => Promise<unknown>
        }) => {
          void source.candidates(
            { sessionId: 's1' },
            { query: '', signal: new AbortController().signal },
          ).catch((error: unknown) => { thrown = error })
          return () => {}
        },
      }),
      effect: (fn: () => () => void) => { fn() },
    } as unknown as ClientContext
    await apply(ctx)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('down')
  })
})
