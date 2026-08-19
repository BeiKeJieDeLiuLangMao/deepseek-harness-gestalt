// @vitest-environment jsdom
// Assembled Browser Dock snapshot: boots the real built client bundles against
// the keyless FixtureApiClient and pins the collapsed preview the fixture
// Session's last `browser/workspace` snapshot restores.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/browser-dock/fixture.expected.txt')

installAssembledBootEnv()

function previewShape(root: Element): string {
  const preview = root.querySelector('[data-browser-preview]')
  if (preview === null) return 'preview=hidden'
  const layers = [...preview.querySelectorAll('button')].map(layer => ({
    label: layer.getAttribute('aria-label') ?? '',
    active: layer.hasAttribute('data-active'),
  }))
  return [
    'preview=shown',
    ...layers.map(layer => `layer=${layer.active ? 'current' : 'back'} ${layer.label}`),
  ].join('\n')
}

describe('assembled Browser Dock preview', () => {
  it('restores the collapsed layered preview from the fixture Session Workspace', async () => {
    mountAssembledApp()
    const tree = await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 10_000 })
    fireEvent.click(await within(tree).findByText('Fixture 历史会话'))
    const preview = await waitFor(() => {
      const found = document.querySelector('[data-browser-preview]')
      expect(found).not.toBeNull()
      return found!
    }, { timeout: 10_000 })
    const shape = previewShape(preview)
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(EXPECTED), { recursive: true })
      writeFileSync(EXPECTED, shape)
    }
    await expect(shape).toMatchFileSnapshot(EXPECTED)
  })
})
