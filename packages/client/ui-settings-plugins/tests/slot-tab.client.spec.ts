import { describe, expect, it } from 'vitest'
import { labeledSlotTab } from '../src/client/slot-tab.ts'

describe('labeledSlotTab', () => {
  it('projects id, order, and a resolved label', () => {
    expect(labeledSlotTab({
      options: { id: 'deepseek', order: 2, label: 'DeepSeek' },
    })).toEqual({ id: 'deepseek', order: 2, label: 'DeepSeek' })
  })

  it('fills missing registration fields with empty id, zero order, and empty label', () => {
    expect(labeledSlotTab({ options: {} })).toEqual({ id: '', order: 0, label: '' })
  })
})
