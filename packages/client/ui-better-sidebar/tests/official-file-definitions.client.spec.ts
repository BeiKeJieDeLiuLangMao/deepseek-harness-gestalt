import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  officialBuiltinViewers,
  officialFileDefinition,
  OFFICIAL_FILE_ID,
  OFFICIAL_FILE_KIND,
} from '../src/client/official-files/definitions.ts'
import { officialFileAddress, parseOfficialFileAddress } from '../src/client/official-files/address.ts'
import { OfficialFileRuntime } from '../src/client/official-files/runtime.ts'

describe('official file definitions', () => {
  it('claims file resources and preserves the six viewer matching strategies', () => {
    const registry = new SidebarRightTabRegistry(new Context())
    registry.register(officialFileDefinition(new OfficialFileRuntime()))
    for (const viewer of officialBuiltinViewers()) registry.registerViewer(viewer)

    const address = (path: string) => officialFileAddress(SessionId('s'), undefined, path)
    expect(registry.claim(address('notes/a.md'))).toMatchObject({ kind: OFFICIAL_FILE_KIND })
    expect(registry.get(OFFICIAL_FILE_KIND)?.id).toBe(OFFICIAL_FILE_ID)
    expect(registry.viewers().map(viewer => [viewer.id, viewer.fetchStrategy])).toEqual([
      ['image', 'mediaUrl'],
      ['pdf', 'mediaUrl'],
      ['markdown', 'fsRead'],
      ['html', 'fsRead'],
      ['code', 'fsRead'],
      ['binary-download', 'binary-download'],
    ])
    expect(registry.matchViewer({ address: address('a.png'), path: 'a.png' })?.id).toBe('image')
    expect(registry.matchViewer({ address: address('a.pdf'), path: 'a.pdf' })?.id).toBe('pdf')
    expect(registry.matchViewer({ address: address('a.md'), path: 'a.md' })?.id).toBe('markdown')
    expect(registry.matchViewer({ address: address('a.html'), path: 'a.html' })?.id).toBe('html')
    expect(registry.matchViewer({ address: address('a.ts'), path: 'a.ts' })?.id).toBe('code')
    expect(registry.matchViewer({ address: address('a.data'), path: 'a.data', head: new Uint8Array([1, 0]) })?.id)
      .toBe('binary-download')
  })

  it('claims canonical dot paths through the registered official type', () => {
    const registry = new SidebarRightTabRegistry(new Context())
    registry.register(officialFileDefinition(new OfficialFileRuntime()))
    const owner = SessionId('child')
    const cases = [
      { address: officialFileAddress(owner, '/work', '../outside/a.txt'), path: '../outside/a.txt' },
      { address: 'dsh-resource://file/session/child/./a.txt', path: './a.txt' },
      { address: officialFileAddress(owner, '/work', 'dir/../a.txt'), path: 'dir/../a.txt' },
    ]

    for (const { address, path } of cases) {
      expect(registry.claim(address)).toMatchObject({ kind: OFFICIAL_FILE_KIND, contentId: address })
      expect(parseOfficialFileAddress(address)).toEqual({ scope: 'session', sessionId: owner, path })
    }
  })

  it('declares official preferences and rejects malformed file addresses', () => {
    const definition = officialFileDefinition(new OfficialFileRuntime())
    expect(definition.priority).toBe('builtin')
    expect(definition.canOpen?.('https://example.test/a.md')).toBe(false)
    expect(definition.canOpen?.('dsh-resource://file/absolute/etc/hosts')).toBe(false)
    expect(definition.settings?.fields.map(field => field.key)).toEqual(['editorExplorer', 'workspaceFence'])
    const html = officialBuiltinViewers().find(viewer => viewer.id === 'html')
    expect(html?.settings?.fields.map(field => [field.key, field.unsafe])).toEqual([
      ['htmlViewerNoSandbox', true],
      ['htmlViewerDefaultUnsafe', true],
    ])
    expect(typeof definition.beforeClose).toBe('function')
  })
})
