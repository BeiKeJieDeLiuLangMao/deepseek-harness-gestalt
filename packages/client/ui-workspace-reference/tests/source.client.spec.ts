import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { createWorkspaceSource } from '../src/client/source.ts'
import type { WorkspacePathEntry } from '../src/client/rank.ts'

const SIGNAL = new AbortController().signal
const SESSION = { sessionId: 's1' as SessionId } as ClientSessionContext

const FILES: readonly WorkspacePathEntry[] = [
  { relative: 'src/a.ts', kind: 'file' },
  { relative: 'docs', kind: 'dir' },
]

describe('createWorkspaceSource', () => {
  it('ranks the fetched index and inserts a trailing-slash directory token', async () => {
    const source = createWorkspaceSource(async () => FILES)
    const candidates = await source.candidates(SESSION, {
      query: 'doc',
      position: 'leading',
      signal: SIGNAL,
    })
    expect(candidates).toEqual([
      { name: 'docs', description: 'docs/' },
    ])
    expect(source.onPick({
      candidate: candidates[0]!,
      session: SESSION,
      position: 'leading',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 0 },
    })).toEqual({ text: '@docs/ ' })
  })

  it('inserts a file path without a trailing slash', async () => {
    const source = createWorkspaceSource(async () => FILES)
    const candidates = await source.candidates(SESSION, {
      query: 'a.ts',
      position: 'leading',
      signal: SIGNAL,
    })
    expect(source.onPick({
      candidate: candidates[0]!,
      session: SESSION,
      position: 'leading',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 0 },
    })).toEqual({ text: '@src/a.ts ' })
  })

  it('exposes a lexicon after the first fetch and ignores aborted candidate polls', async () => {
    const source = createWorkspaceSource(async () => FILES)
    const aborted = new AbortController()
    aborted.abort()
    expect(await source.candidates(SESSION, {
      query: 'a.ts',
      position: 'leading',
      signal: aborted.signal,
    })).toEqual([])
    await source.candidates(SESSION, {
      query: '',
      position: 'leading',
      signal: SIGNAL,
    })
    expect(source.lexicon?.(SESSION)).toEqual(['src/a.ts', 'docs'])
    source.warm?.(SESSION)
    const errors: unknown[] = []
    const original = console.error
    console.error = (...args: unknown[]) => { errors.push(args) }
    const stop = source.subscribeLexicon?.(SESSION, () => { throw new Error('lexicon boom') })
    const withInvalidate = source as typeof source & { invalidate(id: SessionId): void }
    withInvalidate.invalidate(SESSION.sessionId)
    console.error = original
    expect(errors[0]).toEqual(['[ui-workspace-reference] lexicon listener failed:', expect.any(Error)])
    stop?.()
  })

  it('invalidates a cached index and rethrows a failed fetch', async () => {
    let calls = 0
    const source = Object.assign(createWorkspaceSource(async () => {
      calls += 1
      if (calls === 1) throw new Error('boom')
      return FILES
    }), {})
    const withInvalidate = source as typeof source & { invalidate(id: SessionId): void }
    source.warm?.(SESSION)
    await expect(source.candidates(SESSION, {
      query: '',
      position: 'leading',
      signal: SIGNAL,
    })).rejects.toThrow('boom')
    withInvalidate.invalidate('missing' as SessionId)
    const heard: number[] = []
    const stop = source.subscribeLexicon?.(SESSION, () => { heard.push(1) })
    expect(await source.candidates(SESSION, {
      query: '',
      position: 'leading',
      signal: SIGNAL,
    })).toHaveLength(2)
    withInvalidate.invalidate(SESSION.sessionId)
    expect(heard).toEqual([1, 1])
    const extra = source.subscribeLexicon?.(SESSION, () => {})
    extra?.()
    stop?.()
    expect(source.codec?.clipboardText('src/a.ts')).toBe('@src/a.ts')
    await expect(source.codec?.serialize('src/a.ts', SIGNAL)).resolves.toBe('@src/a.ts')
    expect(source.onPick({
      candidate: { name: 'plain', description: 'plain' },
      session: SESSION,
      position: 'leading',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 0 },
    })).toEqual({ text: '@plain ' })
  })
})
