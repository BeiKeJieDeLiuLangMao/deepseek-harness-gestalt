import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { openOfficialBrowserUrl } from '../src/client/official-browser/index.tsx'

describe('official Browser URL open', () => {
  it('uses the official URL target and keeps the requested Session', async () => {
    const openTab = vi.fn(async () => 'tab:docs')
    const forSession = vi.fn(() => ({ openTab }))
    const sidebar = { forSession }
    const tabs = {
      matchUrlTarget: () => ({ kind: 'docs' }),
      get: () => ({ kind: 'browser' }),
    }
    await expect(openOfficialBrowserUrl(
      sidebar as never,
      tabs as never,
      SessionId('session-1'),
      'https://docs.example.test/guide',
      'Guide',
    )).resolves.toBe('tab:docs')
    expect(forSession).toHaveBeenCalledWith('session-1')
    expect(openTab).toHaveBeenCalledWith('docs', {
      instanceId: 'https://docs.example.test/guide',
      title: 'Guide',
      payload: { url: 'https://docs.example.test/guide' },
    })
  })
})
