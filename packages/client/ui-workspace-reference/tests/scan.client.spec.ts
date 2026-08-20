import { describe, expect, it } from 'vitest'
import { filterIndexedFiles, invalidBasenameRegex } from '../src/client/scan.ts'

describe('draft Workspace Reference scan', () => {
  it('filters indexed files by exact and regex basename', () => {
    const files = [
      { relative: 'src/a.ts' },
      { relative: 'src/b.md' },
      { relative: 'docs/a.ts' },
    ]
    expect(filterIndexedFiles(files, '.ts', '').map(file => file.relative)).toEqual(['src/a.ts', 'docs/a.ts'])
    expect(filterIndexedFiles(files, '', '^b').map(file => file.relative)).toEqual(['src/b.md'])
    expect(filterIndexedFiles(files, '', '(').map(file => file.relative)).toEqual(['src/a.ts', 'src/b.md', 'docs/a.ts'])
    expect(invalidBasenameRegex('')).toBe(false)
    expect(invalidBasenameRegex('^src')).toBe(false)
    expect(invalidBasenameRegex('(')).toBe(true)
  })
})
