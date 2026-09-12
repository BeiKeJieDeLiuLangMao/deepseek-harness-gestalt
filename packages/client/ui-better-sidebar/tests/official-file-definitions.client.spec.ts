import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import {
  OFFICIAL_EDITOR_DOCUMENT_IDS,
  OFFICIAL_EDITOR_ID,
  OFFICIAL_FILE_KIND,
  officialBuiltinViewers,
  officialFileDefinition,
} from '../src/client/official-files/definitions.ts'
import { OfficialFileRuntime } from '../src/client/official-files/runtime.ts'

describe('official file supplements', () => {
  it('does not claim file addresses while retaining an explicit folder kind', () => {
    const registry = new SidebarRightTabRegistry(new Context())
    registry.register(officialFileDefinition(new OfficialFileRuntime()))
    expect(registry.candidates('dsh-resource://file/session/s/notes/a.md')).toEqual([])
    expect(registry.claim('dsh-resource://file/session/s/notes/a.md', OFFICIAL_FILE_KIND).kind).toBe('file')
  })

  it('supplements only official plain-text, Markdown, and code renderers', () => {
    expect(OFFICIAL_EDITOR_ID).toBe('@deepseek-ai/dsh-client-ui-better-sidebar/editor')
    expect(officialBuiltinViewers()).toBe(OFFICIAL_EDITOR_DOCUMENT_IDS)
    expect([...OFFICIAL_EDITOR_DOCUMENT_IDS]).toEqual([
      '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text',
      '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown',
      '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/code',
    ])
  })
})
