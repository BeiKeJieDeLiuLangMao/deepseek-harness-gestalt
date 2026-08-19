// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { WorkspaceReferenceDock, type WorkspaceReferenceDockProps } from '../src/client/Dock.tsx'
import { createWorkspaceReferenceStore } from '../src/client/settings-store.ts'
import { DEFAULT_WORKSPACE_REFERENCE_SETTINGS, type WorkspaceReferenceSettings } from '../src/settings.ts'

function dockProps(draft: string, enable = true) {
  const store = createWorkspaceReferenceStore().create()
  const state: WorkspaceReferenceSettings = { ...DEFAULT_WORKSPACE_REFERENCE_SETTINGS, enable }
  store.actions.sync(state)
  const setDraft = vi.fn()
  const openPath = vi.fn()
  return {
    session: {} as never,
    input: { draft } as never,
    inputActions: { setDraft },
    useStore: <T,>(select: (state: WorkspaceReferenceSettings) => T) => select(state),
    useSession: () => undefined,
    useSessions: () => undefined,
    useWorkspaces: () => undefined,
    sessionId: 's1',
    actions: store.actions,
    t: (key: string) => key,
    openPath,
    setDraft,
  }
}

describe('WorkspaceReferenceDock', () => {
  it('lists draft paths and can open or remove them', () => {
    const props = dockProps('see @README.md please')
    const view = render(<WorkspaceReferenceDock {...props as unknown as WorkspaceReferenceDockProps} />)
    expect(view.getByText('README.md')).toBeTruthy()
    fireEvent.click(view.getByText('README.md'))
    expect(props.openPath).toHaveBeenCalledWith('README.md')
    fireEvent.click(view.getByLabelText('dock.remove'))
    expect(props.setDraft).toHaveBeenCalledWith('see please')
    view.unmount()
  })

  it('hides when the feature is disabled', () => {
    const view = render(<WorkspaceReferenceDock {...dockProps('see @README.md', false) as unknown as WorkspaceReferenceDockProps} />)
    expect(view.queryByText('README.md')).toBeNull()
  })
})
