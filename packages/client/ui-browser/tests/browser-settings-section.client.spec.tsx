// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { BrowserSettingsSection, type BrowserSettingsSectionProps } from '../src/client/BrowserSettingsSection.tsx'
import { DEFAULT_BROWSER_SETTINGS, type BrowserSettings } from '../src/browser-settings.ts'

function renderSection(
  state: BrowserSettings,
  actions: Pick<
    BrowserSettingsSectionProps,
    'setDefaultKind' | 'setDefaultPersistentName' | 'addNamedProfile' | 'removeNamedProfile' | 'renameNamedProfile'
  >,
) {
  return render(
    <BrowserSettingsSection {...{
      useSettings: <T,>(select: (prefs: BrowserSettings) => T) => select(state),
      t: (key: string) => key,
      ...actions,
    } as unknown as BrowserSettingsSectionProps} />,
  )
}

afterEach(cleanup)

describe('BrowserSettingsSection', () => {
  it('writes the default identity and adds a valid roster name from a focused dialog', () => {
    const setDefaultKind = vi.fn()
    const setDefaultPersistentName = vi.fn()
    const addNamedProfile = vi.fn()
    const removeNamedProfile = vi.fn()
    const renameNamedProfile = vi.fn()
    const view = renderSection(DEFAULT_BROWSER_SETTINGS, {
      setDefaultKind, setDefaultPersistentName, addNamedProfile, removeNamedProfile, renameNamedProfile,
    })
    fireEvent.click(view.getByLabelText('settings.kind.temporary'))
    expect(setDefaultKind).toHaveBeenCalledWith('temporary')
    expect(view.queryByRole('dialog')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'settings.roster.openAdd' }))
    expect(view.getByRole('dialog', { name: 'settings.roster.addTitle' })).toBeTruthy()
    const name = view.getByLabelText('settings.roster.add') as HTMLInputElement
    expect(document.activeElement).toBe(name)
    fireEvent.change(view.getByLabelText('settings.roster.add'), { target: { value: 'work' } })
    fireEvent.click(view.getByRole('button', { name: 'settings.roster.submit' }))
    expect(addNamedProfile).toHaveBeenCalledWith('work')
    expect(view.queryByRole('dialog')).toBeNull()
    view.unmount()
  })

  it('validates and cancels the add dialog without retaining its draft', () => {
    const setDefaultKind = vi.fn()
    const setDefaultPersistentName = vi.fn()
    const addNamedProfile = vi.fn()
    const removeNamedProfile = vi.fn()
    const renameNamedProfile = vi.fn()
    const view = renderSection({
      defaultKind: 'persistent',
      defaultPersistentName: 'work',
      namedProfiles: ['work'],
    }, { setDefaultKind, setDefaultPersistentName, addNamedProfile, removeNamedProfile, renameNamedProfile })
    fireEvent.change(view.getByLabelText('settings.defaultPersistentName'), { target: { value: '' } })
    expect(setDefaultPersistentName).toHaveBeenCalledWith('')
    fireEvent.click(view.getByRole('button', { name: 'settings.roster.openAdd' }))
    fireEvent.change(view.getByLabelText('settings.roster.add'), { target: { value: 'tmp' } })
    expect(view.getByRole('alert').textContent).toBe('settings.roster.invalid')
    expect((view.getByRole('button', { name: 'settings.roster.submit' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(view.getByLabelText('settings.roster.add'), { target: { value: 'work' } })
    expect(view.getByRole('alert').textContent).toBe('settings.roster.duplicate')
    fireEvent.click(view.getByRole('button', { name: 'settings.cancel' }))
    expect(view.queryByRole('dialog')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'settings.roster.openAdd' }))
    expect((view.getByLabelText('settings.roster.add') as HTMLInputElement).value).toBe('')
    view.unmount()
  })

  it('keeps roster rows compact until an explicit rename', () => {
    const setDefaultKind = vi.fn()
    const setDefaultPersistentName = vi.fn()
    const addNamedProfile = vi.fn()
    const removeNamedProfile = vi.fn()
    const renameNamedProfile = vi.fn()
    const view = renderSection({
      defaultKind: 'persistent',
      defaultPersistentName: 'work',
      namedProfiles: ['work'],
    }, { setDefaultKind, setDefaultPersistentName, addNamedProfile, removeNamedProfile, renameNamedProfile })
    expect(view.getByText('work', { selector: 'span' })).toBeTruthy()
    expect(view.queryByLabelText('settings.roster.name: work')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'settings.roster.rename: work' }))
    const name = view.getByLabelText('settings.roster.name: work') as HTMLInputElement
    expect(document.activeElement).toBe(name)
    fireEvent.change(name, { target: { value: 'lab' } })
    fireEvent.keyDown(name, { key: 'Escape' })
    expect(view.queryByLabelText('settings.roster.name: work')).toBeNull()
    expect(renameNamedProfile).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'settings.roster.rename: work' }))
    const reopened = view.getByLabelText('settings.roster.name: work')
    fireEvent.change(reopened, { target: { value: 'desk' } })
    fireEvent.keyDown(reopened, { key: 'Enter' })
    expect(renameNamedProfile).toHaveBeenCalledWith('work', 'desk')
    fireEvent.click(view.getByRole('button', { name: 'settings.roster.remove: work' }))
    expect(removeNamedProfile).toHaveBeenCalledWith('work')
    view.unmount()
  })
})
