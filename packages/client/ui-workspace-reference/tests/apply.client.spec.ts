import { describe, expect, it } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { apply } from '../src/client/index.ts'

describe('ui-workspace-reference apply', () => {
  it('mounts the search Remote and registers the workspace source', async () => {
    const sources: string[] = []
    let disposed = false
    const ctx = {
      remote: {
        $mount: async () => async () => { disposed = true },
        workspaceReference: {
          search: async () => ({ ok: true, value: [] }),
        },
      },
      get: () => ({
        registerSource: (source: { name: string }) => {
          sources.push(source.name)
          return () => {}
        },
      }),
      effect: (fn: () => () => void) => { fn() },
    } as unknown as ClientContext
    await apply(ctx)
    expect(sources).toEqual(['workspace'])
    expect(disposed).toBe(false)
  })
})
