import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import { TYPERT_MANIFEST } from '../src/typert.ts'

describe('workspace-reference apply', () => {
  it('registers the Typert manifest and a pre-step listener', () => {
    const ctx = new Context()
    const manifests: unknown[] = []
    Object.assign(ctx, {
      typert: {
        register(manifest: unknown) {
          manifests.push(manifest)
          return () => {}
        },
      },
    })
    apply(ctx, { maxIndexedFiles: 10, ignoreDirs: [] })
    expect(manifests).toEqual([TYPERT_MANIFEST])
  })
})
