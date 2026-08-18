import { describe, expect, it } from 'vitest'
import { rankFiles } from '@deepseek-ai/dsh-workspace-reference'
import type { WorkspacePathEntry } from '@deepseek-ai/dsh-workspace-reference'

const FILES: readonly WorkspacePathEntry[] = [
  { relative: 'src/view.ts', kind: 'file' },
  { relative: 'src/client/view.ts', kind: 'file' },
  { relative: 'docs', kind: 'dir' },
  { relative: 'README.md', kind: 'file' },
]

describe('rankFiles', () => {
  it('browses directories first when the query is empty', () => {
    expect(rankFiles(FILES, '', 10).map(entry => entry.relative)).toEqual([
      'docs',
      'README.md',
      'src/client/view.ts',
      'src/view.ts',
    ])
  })

  it('matches a basename query without scattering letters across the path', () => {
    expect(rankFiles(FILES, 'readme', 10).map(entry => entry.relative)).toEqual(['README.md'])
  })

  it('matches ordered path segments', () => {
    expect(rankFiles(FILES, 'src/view', 10).map(entry => entry.relative)).toEqual([
      'src/view.ts',
      'src/client/view.ts',
    ])
  })
})
