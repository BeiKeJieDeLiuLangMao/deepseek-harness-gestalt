// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { WorkspaceReferenceSettingsSection, type WorkspaceReferenceSettingsProps } from '../src/client/SettingsSection.tsx'
import { DEFAULT_WORKSPACE_REFERENCE_SETTINGS, type WorkspaceReferenceSettings } from '../src/settings.ts'

describe('WorkspaceReferenceSettingsSection', () => {
  it('writes enable, paste ignore, and filter fields', () => {
    const setField = vi.fn()
    const props = {
      useSettings: <T,>(select: (state: WorkspaceReferenceSettings) => T) => select(DEFAULT_WORKSPACE_REFERENCE_SETTINGS),
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

  it('disables paste ignore and filters while enable is off', () => {
    const setField = vi.fn()
    const state = { ...DEFAULT_WORKSPACE_REFERENCE_SETTINGS, enable: false }
    const view = render(
      <WorkspaceReferenceSettingsSection {...{
        useSettings: <T,>(select: (prefs: WorkspaceReferenceSettings) => T) => select(state),
        t: (key: string) => key,
        setField,
      } as unknown as WorkspaceReferenceSettingsProps} />,
    )
    expect((view.getByLabelText('settings.pasteIgnore') as HTMLInputElement).disabled).toBe(true)
    expect((view.getByLabelText('settings.exact') as HTMLInputElement).disabled).toBe(true)
    expect((view.getByLabelText('settings.regex') as HTMLInputElement).disabled).toBe(true)
    view.unmount()
  })

  it('shows an inline error for an invalid regex without disabling fail-open filtering', () => {
    const setField = vi.fn()
    const state = { ...DEFAULT_WORKSPACE_REFERENCE_SETTINGS, regex: '(' }
    const view = render(
      <WorkspaceReferenceSettingsSection {...{
        useSettings: <T,>(select: (prefs: WorkspaceReferenceSettings) => T) => select(state),
        t: (key: string) => key,
        setField,
      } as unknown as WorkspaceReferenceSettingsProps} />,
    )
    expect(view.getByLabelText('settings.regex').getAttribute('aria-invalid')).toBe('true')
    expect(view.getByRole('alert').textContent).toBe('settings.regexInvalid')
    view.unmount()
  })
})
