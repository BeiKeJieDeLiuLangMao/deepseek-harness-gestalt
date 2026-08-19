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
})
