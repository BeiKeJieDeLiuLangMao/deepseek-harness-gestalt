import { describe, expect, it } from 'vitest'
import { planHostExit } from '../src/host-exit.ts'

describe('planHostExit', () => {
  it('ignores an exit after the window is gone, respawns once, then errors', () => {
    expect(planHostExit(false, false)).toBe('ignore')
    expect(planHostExit(true, false)).toBe('respawn')
    expect(planHostExit(true, true)).toBe('error')
  })
})
