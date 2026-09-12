import { describe, expect, it } from 'vitest'
import type { PaneId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { treeSelectionOpenOptions } from '../src/client/official-files/OfficialEditorHost.tsx'

const PANE = 'pane' as PaneId

describe('treeSelectionOpenOptions', () => {
  it('keeps merged selections in the tree pane without replacing the tree tab', () => {
    expect(treeSelectionOpenOptions(true, PANE)).toEqual({ paneId: 'pane' })
  })

  it('opens split selections with a closed tree payload', () => {
    expect(treeSelectionOpenOptions(false, PANE)).toEqual({
      payload: { treeOpen: false, treeWidth: 240, dir: false },
    })
  })
})
