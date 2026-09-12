import { describe, expect, it } from 'vitest'
import { treeSelectionOpenOptions } from '../src/client/official-files/OfficialEditorHost.tsx'

describe('treeSelectionOpenOptions', () => {
  it('keeps merged selections in the tree pane without replacing the tree tab', () => {
    expect(treeSelectionOpenOptions(true, 'pane')).toEqual({ paneId: 'pane' })
  })

  it('opens split selections with a closed tree payload', () => {
    expect(treeSelectionOpenOptions(false, 'pane')).toEqual({
      payload: { treeOpen: false, treeWidth: 240, dir: false },
    })
  })
})
