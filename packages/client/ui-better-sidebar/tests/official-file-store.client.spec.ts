import { describe, expect, it } from 'vitest'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { createOfficialFilesStore } from '../src/client/official-files/store.ts'

const TAB = 'file-tab' as TabId

describe('official file tree state', () => {
  it('reveals every file and expands its ancestors from the tree root', () => {
    const instance = createOfficialFilesStore().create()
    instance.actions.start(TAB, '/work')
    instance.actions.reveal(TAB, ['/work/src/a.ts', '/work/docs/deep/b.txt'])
    expect(instance.getSnapshot().byTab[TAB]).toEqual({
      root: '/work',
      expanded: ['/work', '/work/src', '/work/docs', '/work/docs/deep'],
      revealed: ['/work/src/a.ts', '/work/docs/deep/b.txt'],
    })
  })
})
