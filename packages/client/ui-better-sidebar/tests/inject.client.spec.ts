import { describe, expect, it } from 'vitest'
import { inject } from '../src/client/index.ts'

describe('Better Sidebar client injection', () => {
  it('declares the official document editor registry it consumes during apply', () => {
    expect(inject).toContain('documentEditors')
    expect(inject.filter(name => name === 'documentEditors')).toHaveLength(1)
  })
})
