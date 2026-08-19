import { describe, expect, it } from 'vitest'
import { rankFiles, type WorkspacePathEntry } from '../src/client/rank.ts'

const FILES: readonly WorkspacePathEntry[] = [
  { relative: 'src/view.ts', kind: 'file' },
  { relative: 'src/client/view.ts', kind: 'file' },
  { relative: 'docs', kind: 'dir' },
  { relative: 'README.md', kind: 'file' },
]

describe('rankFiles', () => {
  it('browses directories first when the query is empty', () => {
    expect(rankFiles(FILES, '   ', 10).map(entry => entry.relative)).toEqual([
      'docs',
      'README.md',
      'src/client/view.ts',
      'src/view.ts',
    ])
  })

  it('matches ordered path segments and trailing-slash prefixes', () => {
    expect(rankFiles(FILES, 'src/view', 10).map(entry => entry.relative)).toEqual([
      'src/view.ts',
      'src/client/view.ts',
    ])
    expect(rankFiles(FILES, 'src/', 10).map(entry => entry.relative)).toEqual([
      'src/view.ts',
      'src/client/view.ts',
    ])
    expect(rankFiles(FILES, 'rdme', 10).map(entry => entry.relative)).toEqual(['README.md'])
  })
})
