import { describe, expect, it } from 'vitest'
import { classifyNavigation } from '../src/navigation-policy.ts'

describe('classifyNavigation', () => {
  const host = 'http://127.0.0.1:43123/session/one'

  it('allows only the current Web Host origin in the main window', () => {
    expect(classifyNavigation('http://127.0.0.1:43123/session/two', host)).toBe('host')
    expect(classifyNavigation('http://127.0.0.1:43124/session/two', host)).toBe('deny')
    expect(classifyNavigation('http://localhost:43123/session/two', host)).toBe('deny')
  })

  it('opens ordinary HTTP links externally and rejects unsafe schemes', () => {
    expect(classifyNavigation('https://example.com/docs', host)).toBe('external')
    expect(classifyNavigation('http://example.com/docs', host)).toBe('external')
    expect(classifyNavigation('file:///etc/passwd', host)).toBe('deny')
    expect(classifyNavigation('javascript:alert(1)', host)).toBe('deny')
    expect(classifyNavigation('not a url', host)).toBe('deny')
  })
})
