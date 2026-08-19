// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { WorkspaceReferenceDock, type WorkspaceReferenceDockProps } from '../src/client/Dock.tsx'
import { DEFAULT_WORKSPACE_REFERENCE_SETTINGS, type WorkspaceReferenceSettings } from '../src/settings.ts'

function dockProps(draft: string, enable = true) {
  const state: WorkspaceReferenceSettings = { ...DEFAULT_WORKSPACE_REFERENCE_SETTINGS, enable }
  const setDraft = vi.fn()
  const openPath = vi.fn()
  return {
    session: {} as never,
    input: { draft } as never,
    inputActions: { setDraft },
    useSettings: <T,>(select: (state: WorkspaceReferenceSettings) => T) => select(state),
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
