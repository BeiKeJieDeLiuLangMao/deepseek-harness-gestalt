// @vitest-environment jsdom
/**
 * Header controls keep both official dock surfaces reachable. The right
 * control leaves a same-size footprint while shown, and the bottom control
 * toggles without discarding its tabs.
 */
import { describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ExpandButton } from '../src/client/shell/ExpandButton.tsx'
import type { ExpandButtonProps } from '../src/client/shell/ExpandButton.tsx'
import { createSidebarRightStore } from '../src/client/stores.ts'

const SESSION = 's-test' as SessionId

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot))
  }
}

/**
 * Mount the button over a real store instance. It reads four of its props; the
 * rest of the standard kit is framework-injected and never touched here, so one
 * documented cast keeps the harness to what is actually exercised.
 */
function mountButton() {
  const instance = createSidebarRightStore(() => ({ kind: 'guide', title: 'Start' })).create()
  const props = {
    sessionId: SESSION,
    useStore: hookOf(instance),
    actions: instance.actions,
    // Copy is the dictionary's contract; the key stands in for the translation.
    t: (key: string) => key,
  } as unknown as ExpandButtonProps
  const view = render(<ExpandButton {...props} />)
  const control = (): HTMLElement | null => view.container.querySelector('[data-sidebar-right-expand]')
  const bottomControl = (): HTMLElement | null => view.container.querySelector('[data-sidebar-bottom-toggle]')
  const placeholder = (): HTMLElement | null => view.container.querySelector('[data-sidebar-right-expand-placeholder]')
  return { instance, view, control, bottomControl, placeholder }
}

describe('ExpandButton', () => {
  it('offers the way in while the session has no surface yet, and asks the panel to expand', () => {
    const { instance, control, placeholder } = mountButton()
    const button = control()
    if (button === null) throw new Error('expected the expand control')
    expect(button.getAttribute('aria-label')).toBe('chrome.expand')
    expect(placeholder()).toBeNull()
    fireEvent.click(button)
    expect(instance.getSnapshot().bySession[SESSION]?.layout.expanded).toBe(true)
    // Shown: the control gives way to its footprint, so the seat keeps its width.
    expect(control()).toBeNull()
    expect(placeholder()).not.toBeNull()
    cleanup()
  })

  it('comes back when the panel collapses again', () => {
    const { instance, control, placeholder } = mountButton()
    act(() => { instance.actions.setExpanded(SESSION, true) })
    expect(control()).toBeNull()
    act(() => { instance.actions.setExpanded(SESSION, false) })
    expect(control()).not.toBeNull()
    expect(placeholder()).toBeNull()
    cleanup()
  })

  it('toggles the bottom surface without changing the right surface or releasing its Terminal', () => {
    const { instance, bottomControl } = mountButton()
    const open = bottomControl()
    if (open === null) throw new Error('expected the bottom-panel toggle')
    expect(open.getAttribute('aria-label')).toBe('chrome.expandBottom')
    fireEvent.click(open)

    const opened = instance.getSnapshot().bySession[SESSION]
    expect(opened?.layout.expanded).toBe(false)
    expect(opened?.bottom.layout.expanded).toBe(true)
    let terminalId: string | undefined
    act(() => {
      instance.actions.openContent(SESSION, {
        kind: 'terminal',
        contentId: 'sidebar://terminal/spec',
        title: 'Terminal',
        surface: 'bottom',
      }, (id) => { terminalId = id })
    })

    const close = bottomControl()
    if (close === null) throw new Error('expected the bottom-panel toggle')
    expect(close.getAttribute('aria-label')).toBe('chrome.collapseBottom')
    fireEvent.click(close)
    const collapsed = instance.getSnapshot().bySession[SESSION]
    expect(collapsed?.layout.expanded).toBe(false)
    expect(collapsed?.bottom.layout.expanded).toBe(false)
    expect(Object.values(collapsed?.bottom.layout.tabs ?? {}).some(tab => tab.id === terminalId)).toBe(true)
    cleanup()
  })
})
