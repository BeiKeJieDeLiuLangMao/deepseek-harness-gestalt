import { describe, expect, expectTypeOf, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  officialFileAddress,
  officialFileTitle,
  parseOfficialFileAddress,
} from '../src/client/official-files/address.ts'

describe('official file addresses', () => {
  it('keeps workspace paths session-owned and component-encodes names', () => {
    const owner = SessionId('s #1')
    const address = officialFileAddress(owner, '/work', '/work/docs/a #1.md')
    expect(address).toBe('dsh-resource://file/session/s%20%231/docs/a%20%231.md')
    expect(parseOfficialFileAddress(address)).toEqual({ scope: 'session', sessionId: owner, path: 'docs/a #1.md' })
    expectTypeOf(parseOfficialFileAddress(address)?.sessionId).toEqualTypeOf<SessionId | undefined>()
    expect(officialFileTitle(address)).toBe('a #1.md')
  })

  it('round-trips dot segments, absolute paths, Unicode, and URI punctuation without changing the owner', () => {
    const owner = SessionId('child/../会话?#%')
    const paths = [
      '../outside/./a.txt',
      '.',
      '..',
      '/other/../a #?.txt',
      'D:/other/../a.txt',
      '//server/share/../a.txt',
      '目录/雪 &?#%.md',
    ]
    for (const path of paths) {
      const address = officialFileAddress(owner, '/work', path)
      expect(parseOfficialFileAddress(address)).toEqual({ scope: 'session', sessionId: owner, path })
    }

    const session = SessionId('s')
    expect(parseOfficialFileAddress(officialFileAddress(session, '/work', '/other/a.txt')))
      .toEqual({ scope: 'session', sessionId: session, path: '/other/a.txt' })
    expect(parseOfficialFileAddress(officialFileAddress(session, 'C:\\work', 'D:\\other\\a.txt')))
      .toEqual({ scope: 'session', sessionId: session, path: 'D:/other/a.txt' })
    expect(parseOfficialFileAddress(officialFileAddress(session, '/work', '\\\\server\\share\\a.txt')))
      .toEqual({ scope: 'session', sessionId: session, path: '//server/share/a.txt' })
  })

  it('rejects foreign schemes and malformed encoding', () => {
    expect(parseOfficialFileAddress('https://file/session/s/a')).toBeUndefined()
    expect(parseOfficialFileAddress('dsh-resource://file/session/s/%zz')).toBeUndefined()
    expect(parseOfficialFileAddress('dsh-resource://file/session/s/a?b')).toBeUndefined()
    expect(parseOfficialFileAddress('dsh-resource://file/session/s/%2E%2E/a')).toBeUndefined()
  })
})
