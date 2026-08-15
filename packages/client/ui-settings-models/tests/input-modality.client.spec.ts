// @vitest-environment jsdom
/** Isolated coverage for the modality-list helpers the tags share. */
import { describe, expect, it } from 'vitest'
import { declaredModalities, toggleModality } from '../src/client/InputModalityTags.tsx'

describe('declaredModalities', () => {
  it('treats absent, empty, and non-string lists as no answer', () => {
    expect(declaredModalities(undefined)).toBeUndefined()
    expect(declaredModalities([])).toBeUndefined()
    expect(declaredModalities('text')).toBeUndefined()
    expect(declaredModalities(['text', 1])).toBeUndefined()
  })

  it('copies a stored string list so a later toggle cannot mutate the draft', () => {
    const stored = ['image']
    const declared = declaredModalities(stored)
    declared?.push('text')
    expect(stored).toEqual(['image'])
    expect(declared).toEqual(['image', 'text'])
  })
})

describe('toggleModality', () => {
  it('adds, then removes, a known modality and drops an emptied list', () => {
    expect(toggleModality(undefined, 'image')).toEqual(['image'])
    expect(toggleModality(['image'], 'text')).toEqual(['text', 'image'])
    expect(toggleModality(['image'], 'image')).toBeUndefined()
  })

  it('keeps unknown entries and writes known ones in settings-file order', () => {
    expect(toggleModality(['audio', 'image'], 'text')).toEqual(['text', 'image', 'audio'])
  })
})
