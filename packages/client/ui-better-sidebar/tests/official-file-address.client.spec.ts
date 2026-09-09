import { describe, expect, it } from 'vitest'
import {
  officialFileAddress,
  officialFileTitle,
  parseOfficialFileAddress,
} from '../src/client/official-files/address.ts'

describe('official file addresses', () => {
  it('keeps workspace paths session-owned and component-encodes names', () => {
    const address = officialFileAddress('s #1', '/work', '/work/docs/a #1.md')
    expect(address).toBe('dsh-resource://file/session/s%20%231/docs/a%20%231.md')
    expect(parseOfficialFileAddress(address)).toEqual({ scope: 'session', sessionId: 's #1', path: 'docs/a #1.md' })
    expect(officialFileTitle(address)).toBe('a #1.md')
  })

  it('keeps POSIX, Windows, and UNC paths absolute outside the workspace', () => {
    expect(parseOfficialFileAddress(officialFileAddress('s', '/work', '/other/a.txt')))
      .toEqual({ scope: 'absolute', path: '/other/a.txt' })
    expect(parseOfficialFileAddress(officialFileAddress('s', 'C:\\work', 'D:\\other\\a.txt')))
      .toEqual({ scope: 'absolute', path: 'D:/other/a.txt' })
    expect(parseOfficialFileAddress(officialFileAddress('s', '/work', '\\\\server\\share\\a.txt')))
      .toEqual({ scope: 'absolute', path: '//server/share/a.txt' })
  })

  it('rejects foreign schemes and malformed encoding', () => {
    expect(parseOfficialFileAddress('https://file/session/s/a')).toBeUndefined()
    expect(parseOfficialFileAddress('dsh-resource://file/session/s/%zz')).toBeUndefined()
  })
})
