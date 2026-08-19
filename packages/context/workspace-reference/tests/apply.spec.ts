import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import { TYPERT_MANIFEST } from '../src/typert.ts'

describe('workspace-reference apply', () => {
  it('registers the Typert manifest and a pre-step listener', async () => {
    const ctx = new Context()
    const manifests: unknown[] = []
    let listener: ((payload: unknown, next: () => Promise<unknown>) => Promise<unknown>) | undefined
    Object.assign(ctx, {
      typert: {
        register(manifest: unknown) {
          manifests.push(manifest)
          return () => {}
        },
      },
      fs: {
        async lstat() { return undefined },
      },
      on(event: string, fn: (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>) {
        if (event === 'agent/pre-step') listener = fn
        return () => {}
      },
    })
    apply(ctx)
    expect(manifests).toEqual([TYPERT_MANIFEST])
    expect(listener).toBeTypeOf('function')
    const decision = await listener!(
      { agent: { session: { header: { cwd: '/workspace' } } }, messages: [], signal: new AbortController().signal },
      async () => ({ kind: 'enter', messages: [] }),
    )
    expect(decision).toEqual({ kind: 'enter', messages: [] })
  })
})
