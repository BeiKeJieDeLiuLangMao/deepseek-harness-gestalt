import { describe, expect, it } from 'vitest'
import { webHostAnnouncementFromOutput, webUrlFromOutput } from '../src/web-url.ts'

describe('webUrlFromOutput', () => {
  it('reads the loopback announcement and ignores the LAN suffix', () => {
    expect(webUrlFromOutput('dsh web: http://127.0.0.1:4567/?token=launch-token (LAN: http://192.168.1.5:4567/?token=launch-token)\n'))
      .toBe('http://127.0.0.1:4567')
    expect(webHostAnnouncementFromOutput(
      'dsh web: http://127.0.0.1:4567/?token=launch-token (LAN: http://192.168.1.5:4567/?token=launch-token)\n',
    )).toEqual({
      origin: 'http://127.0.0.1:4567',
      launchUrl: 'http://127.0.0.1:4567/?token=launch-token',
    })
  })

  it('returns undefined until the announcement appears', () => {
    expect(webUrlFromOutput('loading plugins\n')).toBeUndefined()
  })
})
