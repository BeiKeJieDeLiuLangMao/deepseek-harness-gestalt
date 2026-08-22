import { describe, expect, it } from 'vitest'
import { workspacePresentationTranslate } from '../src/presentation.tsx'

describe('public Workspace presentation seam', () => {
  it('binds English labels and preserves unresolved owner parameters', () => {
    const t = workspacePresentationTranslate('en')
    expect(t('group.ungrouped')).toBe('Ungrouped')
    expect(t('sessions.expand', { n: 3 })).toBe('Show 3 more sessions')
    expect(t('sessions.expand', {})).toBe('Show {n} more sessions')
  })
})
