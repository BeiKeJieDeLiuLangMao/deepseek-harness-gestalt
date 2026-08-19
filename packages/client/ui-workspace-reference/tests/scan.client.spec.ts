import { describe, expect, it } from 'vitest'
import { filterIndexedFiles, invalidBasenameRegex, PASTE_IGNORE_MARK, removeDraftMention, scanDraftMentions } from '../src/client/scan.ts'

describe('draft Workspace Reference scan', () => {
  it('collects unique tokens and ignores paste marks', () => {
    expect(scanDraftMentions(`see @src/a.ts and @${PASTE_IGNORE_MARK}README.md and @docs/`))
      .toEqual(['src/a.ts', 'docs'])
  })

  it('drops empty and repeated tokens', () => {
    expect(scanDraftMentions('see @/ then @a.ts and @a.ts again')).toEqual(['a.ts'])
  })

  it('removes one token including a trailing slash and space', () => {
    expect(removeDraftMention('see @docs/ and @src/a.ts', 'docs')).toBe('see and @src/a.ts')
  })

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
