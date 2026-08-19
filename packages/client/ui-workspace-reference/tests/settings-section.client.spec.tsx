// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { WorkspaceReferenceSettingsSection, type WorkspaceReferenceSettingsProps } from '../src/client/SettingsSection.tsx'
import { DEFAULT_WORKSPACE_REFERENCE_SETTINGS, type WorkspaceReferenceSettings } from '../src/settings.ts'

describe('WorkspaceReferenceSettingsSection', () => {
  it('writes enable, paste ignore, and filter fields', () => {
    const setField = vi.fn()
    const props = {
      useStore: <T,>(select: (state: WorkspaceReferenceSettings) => T) => select(DEFAULT_WORKSPACE_REFERENCE_SETTINGS),
      t: (key: string) => key,
      setField,
    }
    const view = render(
      <WorkspaceReferenceSettingsSection {...props as unknown as WorkspaceReferenceSettingsProps} />,
    )
    fireEvent.click(view.getByLabelText('settings.enable'))
    expect(setField).toHaveBeenCalledWith('enable', false)
    fireEvent.click(view.getByLabelText('settings.pasteIgnore'))
    expect(setField).toHaveBeenCalledWith('pasteIgnore', false)
    fireEvent.change(view.getByLabelText('settings.exact'), { target: { value: '.ts' } })
    expect(setField).toHaveBeenCalledWith('exact', '.ts')
    fireEvent.change(view.getByLabelText('settings.regex'), { target: { value: '^src' } })
    expect(setField).toHaveBeenCalledWith('regex', '^src')
    view.unmount()
  })
})
