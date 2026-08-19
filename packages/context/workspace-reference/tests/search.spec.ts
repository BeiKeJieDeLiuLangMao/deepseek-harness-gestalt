import { describe, expect, it } from 'vitest'
import { rankFiles } from '../src/search.ts'

const FILES = [
  { relative: 'src/view.ts', kind: 'file' as const },
  { relative: 'src/client/view.ts', kind: 'file' as const },
  { relative: 'docs', kind: 'dir' as const },
  { relative: 'README.md', kind: 'file' as const },
]

describe('rankFiles', () => {
  it('covers browse, prefix, subsequence, and miss paths', () => {
    expect(rankFiles(FILES, '   ', 10).map(entry => entry.relative)).toEqual([
      'docs',
      'README.md',
      'src/client/view.ts',
      'src/view.ts',
    ])
    expect(rankFiles(FILES, 'src/view', 10).map(entry => entry.relative)).toEqual([
      'src/view.ts',
      'src/client/view.ts',
    ])
    expect(rankFiles(FILES, 'src/', 10).map(entry => entry.relative)).toEqual([
      'src/view.ts',
      'src/client/view.ts',
    ])
    expect(rankFiles(FILES, 'rdme', 10).map(entry => entry.relative)).toEqual(['README.md'])
    expect(rankFiles(FILES, '/', 10)).toEqual([])
    expect(rankFiles(FILES, 'docs/', 10)).toEqual([])
    expect(rankFiles(FILES, 'src\\missing', 10)).toEqual([])
    expect(rankFiles(FILES, 'zzzz', 10)).toEqual([])
    expect(rankFiles([
      { relative: 'aa.ts', kind: 'file' },
      { relative: 'aa.ts', kind: 'file' },
    ], '', 10)).toHaveLength(2)
    expect(rankFiles(FILES, 'view', 1)[0]?.relative).toBe('src/view.ts')
    expect(rankFiles(FILES, 'docs', 10)[0]?.relative).toBe('docs')
    expect(rankFiles(FILES, 'EAD', 10)[0]?.relative).toBe('README.md')
    expect(rankFiles(FILES, 'src/client', 10)[0]?.relative).toBe('src/client/view.ts')
    expect(rankFiles([
      { relative: 'ab.ts', kind: 'file' },
      { relative: 'ac.ts', kind: 'file' },
    ], 'a', 10).map(entry => entry.relative)).toEqual(['ab.ts', 'ac.ts'])
  })
})
