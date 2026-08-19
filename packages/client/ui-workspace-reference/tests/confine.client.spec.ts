import { describe, expect, it } from 'vitest'
import { confinedRelative } from '@deepseek-ai/dsh-workspace-reference'
import { confinedDraftPath } from '../src/client/confine.ts'

const CWD = '/workspace'

/** Tokens both implementations must refuse. */
const BOTH_REJECT = [
  '',
  '/etc/passwd',
  'C:/Windows/notepad.exe',
  'C:\\Windows\\notepad.exe',
  '\\\\server\\share\\secret',
  'C:foo',
  '../secret',
  'foo/../../etc/passwd',
] as const

/** Tokens both implementations must accept. Host may rewrite `.` to `''`. */
const BOTH_ACCEPT = [
  'src/a.ts',
  'foo..bar.ts',
  'docs/guide.md',
  '.',
] as const

describe('confinedDraftPath', () => {
  it('agrees with host confinedRelative on absolute, drive, UNC, and escaping tokens', () => {
    for (const token of BOTH_REJECT) {
      expect(confinedRelative(CWD, token), token).toBeUndefined()
      expect(confinedDraftPath(token), token).toBeUndefined()
    }
    for (const token of BOTH_ACCEPT) {
      expect(confinedRelative(CWD, token), token).toBeDefined()
      expect(confinedDraftPath(token), token).toBeDefined()
    }
  })

  it('refuses a .. segment that the host would collapse inside cwd', () => {
    expect(confinedRelative(CWD, 'foo/../bar.ts')).toBe('bar.ts')
    expect(confinedDraftPath('foo/../bar.ts')).toBeUndefined()
  })
})
