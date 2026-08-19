import { describe, expect, it } from 'vitest'
import { createWorkspaceReferenceStore } from '../src/client/settings-store.ts'
import { DEFAULT_WORKSPACE_REFERENCE_SETTINGS } from '../src/settings.ts'

describe('createWorkspaceReferenceStore', () => {
  it('starts at product defaults and mirrors a sync', () => {
    const store = createWorkspaceReferenceStore().create()
    expect(store.getSnapshot()).toEqual(DEFAULT_WORKSPACE_REFERENCE_SETTINGS)
    store.actions.sync({
      enable: false,
      pasteIgnore: false,
      exact: '.ts',
      regex: '^src',
    })
    expect(store.getSnapshot()).toEqual({
      enable: false,
      pasteIgnore: false,
      exact: '.ts',
      regex: '^src',
    })
  })
})
