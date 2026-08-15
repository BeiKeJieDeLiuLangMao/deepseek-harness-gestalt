// @vitest-environment jsdom
/** Isolated coverage for the reasoning-effort helpers the tags share. */
import { describe, expect, it } from 'vitest'
import { declaredEfforts, isInvalidEfforts, toggleEffort } from '../src/client/ReasoningEffortTags.tsx'

describe('declaredEfforts', () => {
  it('treats absent, null, and non-objects as no answer', () => {
    expect(declaredEfforts(undefined)).toBeUndefined()
    expect(declaredEfforts(null)).toBeUndefined()
    expect(declaredEfforts('high')).toBeUndefined()
    expect(declaredEfforts(['high'])).toBeUndefined()
  })

  it('keeps false and copies a stored dict so a later toggle cannot mutate the draft', () => {
    expect(declaredEfforts(false)).toBe(false)
    const stored = { high: 'ultra' }
    const declared = declaredEfforts(stored)
    if (declared === undefined || declared === false) throw new Error('expected a dict')
    declared.low = 'low'
    expect(stored).toEqual({ high: 'ultra' })
    expect(declared).toEqual({ high: 'ultra', low: 'low' })
  })
})

describe('toggleEffort', () => {
  it('adds the canonical wire value, then omits an emptied dict', () => {
    expect(toggleEffort(undefined, 'high')).toEqual({ high: 'high' })
    expect(toggleEffort({ high: 'high' }, 'off')).toEqual({ high: 'high', off: null })
    expect(toggleEffort({ high: 'high' }, 'high')).toBeUndefined()
  })

  it('keeps a custom wire spelling when another level is toggled', () => {
    expect(toggleEffort({ max: 'ultra' }, 'high')).toEqual({ max: 'ultra', high: 'high' })
  })

  it('starts a false model from the pressed level rather than staying disabled', () => {
    expect(toggleEffort(false, 'high')).toEqual({ high: 'high' })
  })
})

describe('isInvalidEfforts', () => {
  it('refuses an empty dict and a dict that only offers off', () => {
    expect(isInvalidEfforts({})).toBe(true)
    expect(isInvalidEfforts({ off: null })).toBe(true)
    expect(isInvalidEfforts({ off: null, high: 'high' })).toBe(false)
    expect(isInvalidEfforts(false)).toBe(false)
    expect(isInvalidEfforts(undefined)).toBe(false)
  })
})
