// @vitest-environment jsdom
/**
 * The guide tab's body: the chain seam, and the shipped guide behind it.
 *
 * The contract a type relies on is the entry box: one per guide entry every
 * registered type contributed, in the registry's order, and picking one opens
 * that type as a page in the guide's own tab. The chain is asserted through
 * what the body hands it — the tab and the shipped guide as the fallback.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { GuideBody } from '../src/client/tabs/guide/GuideBody.tsx'
import type { GuideBodyProps } from '../src/client/tabs/guide/GuideBody.tsx'
import type { SidebarRightGuideBox } from '../src/client/tab-registry.ts'
import type { SidebarRightProjection } from '../src/client/service.ts'
import { SIDEBAR_RIGHT_PREFERENCES_DEFAULTS } from '../src/client/preferences.ts'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SESSION = SessionId('session-a')
const TAB = { sessionId: SESSION, id: 'tab-1', kind: 'guide', contentId: 'sidebar://guide', title: 'Start' }

/** A glyph that marks its box, so a spec can tell an entry with an icon from one without. */
function Glyph({ size }: IconProps): ReactNode {
  return <span data-guide-glyph={size} />
}

/** One entry box as the registry lists it. */
function box(kind: string, order: number, icon?: SidebarRightGuideBox['icon']): SidebarRightGuideBox {
  return {
    kind,
    order,
    title: () => `${kind} title`,
    description: () => `${kind} description`,
    ...icon === undefined ? {} : { icon },
  }
}

/**
 * Mount the body with the entries observable and a chain that renders its
 * fallback, which is what the chain does with no registrant.
 */
function projectedTab(id: string) {
  return {
    sessionId: SESSION,
    surface: 'right',
    paneId: 'pane-1',
    floating: false,
    active: false,
    visible: false,
    record: { id, kind: 'terminal', contentId: `sidebar://terminal/${id}`, title: 'Terminal' },
    state: { payload: undefined },
  } as unknown as SidebarRightProjection['sessions'][number]['tabs'][number]
}

function projection(tabs: readonly ReturnType<typeof projectedTab>[]): SidebarRightProjection {
  return {
    mountedSessionId: SESSION,
    sessions: [{
      sessionId: SESSION,
      rightExpanded: true,
      bottomExpanded: false,
      bottomHeight: 300,
      bottomOpenedOnce: false,
      tabs,
      data: {},
    }],
    pinned: [],
  }
}

function mountGuide(entries: readonly SidebarRightGuideBox[], tabs: readonly ReturnType<typeof projectedTab>[] = []) {
  const guideEntries = createSnapshotStore<readonly SidebarRightGuideBox[]>(entries)
  const guideWorkbench = createSnapshotStore<SidebarRightProjection>(projection(tabs))
  const guidePreferences = createSnapshotStore({
    status: 'ready' as const,
    preferences: SIDEBAR_RIGHT_PREFERENCES_DEFAULTS,
    revision: 1,
    writable: true,
  })
  const openTab = vi.fn()
  const renderSlot = vi.fn((_seat: string, _owner: unknown, options: { fallback: ReactNode }) => options.fallback)
  const props = {
    useTabInfo: () => ({ tab: { ...TAB, actions: { openResource: vi.fn(), openTab, close: vi.fn() } } }),
    useGuideEntries: bindSnapshotSelector(guideEntries),
    useGuideWorkbench: bindSnapshotSelector(guideWorkbench),
    useGuidePreferences: bindSnapshotSelector(guidePreferences),
    renderSlotChain: renderSlot,
    // Copy is the dictionary's contract; the key stands in for the translation.
    t: (key: string) => key,
  } as unknown as GuideBodyProps
  const view = render(<GuideBody {...props} />)
  const boxes = (): string[] =>
    [...view.container.querySelectorAll('[data-sidebar-right-guide-entry]')].map(node => node.getAttribute('data-sidebar-right-guide-entry') ?? '')
  return { view, guideEntries, guideWorkbench, openTab, renderSlot, boxes, useTabInfo: props.useTabInfo }
}

describe('GuideBody', () => {
  it('renders the chain with the same tab hook, and the shipped guide as its fallback', () => {
    const { view, renderSlot, boxes, useTabInfo } = mountGuide([box('files', 10, Glyph), box('terminal', 20)])
    expect(renderSlot).toHaveBeenCalledWith('sidebar.right.tab.guide', {}, {
      hookContext: useTabInfo, fallback: expect.anything() as ReactNode,
    })
    const guide = view.container.querySelector('[data-sidebar-right-guide]')
    expect(guide?.textContent).toContain('guide.lead')
    expect(guide?.textContent).toContain('guide.body')
    // One box per entry, in the registry's order, each with its own words; only the first brought a glyph.
    expect(boxes()).toEqual(['files', 'terminal'])
    const [files, terminal] = [...view.container.querySelectorAll('[data-sidebar-right-guide-entry]')]
    expect(files?.textContent).toBe('files titlefiles description')
    expect(files?.querySelector('[data-guide-glyph]')?.getAttribute('data-guide-glyph')).toBe('16')
    expect(terminal?.querySelector('[data-guide-glyph]')).toBeNull()
    cleanup()
  })

  it('picking a box opens that type in the guide\'s own place', () => {
    const { view, openTab } = mountGuide([box('files', 10)])
    const entry = view.container.querySelector('[data-sidebar-right-guide-entry="files"]')
    if (entry === null) throw new Error('expected the files box')
    fireEvent.click(entry)
    expect(openTab).toHaveBeenCalledWith('files', { replaceTab: true })
    cleanup()
  })

  it('draws the words alone while no type contributed an entry, and follows the registry when one does', () => {
    const { view, guideEntries, boxes } = mountGuide([])
    expect(view.container.querySelector('[data-sidebar-right-guide]')).not.toBeNull()
    expect(boxes()).toEqual([])
    act(() => { guideEntries.set([box('files', 10)]) })
    expect(boxes()).toEqual(['files'])
    cleanup()
  })

  it('evaluates availability against the current Session and contains callback failures', () => {
    const available = vi.fn(({ sessionId, preferences, tabs }) => {
      expect(sessionId).toBe(SESSION)
      expect(preferences).toBe(SIDEBAR_RIGHT_PREFERENCES_DEFAULTS)
      return tabs.length < 3
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const entries: SidebarRightGuideBox[] = [
      { ...box('terminal', 10), available },
      { ...box('broken', 20), available: () => { throw new Error('broken availability') } },
    ]
    const { guideWorkbench, boxes } = mountGuide(entries, [projectedTab('one'), projectedTab('two')])

    expect(boxes()).toEqual(['terminal'])
    expect(available).toHaveBeenLastCalledWith(expect.objectContaining({
      sessionId: SESSION,
      tabs: expect.arrayContaining([
        expect.objectContaining({ id: 'one', kind: 'terminal' }),
        expect.objectContaining({ id: 'two', kind: 'terminal' }),
      ]) as unknown,
    }))
    expect(errors).toHaveBeenCalledWith(
      'sidebarRight: available failed for guide kind "broken"',
      expect.any(Error),
    )

    act(() => { guideWorkbench.set(projection([projectedTab('one'), projectedTab('two'), projectedTab('three')])) })
    expect(boxes()).toEqual([])
    cleanup()
  })

  it('keeps two boxes of one type at the same order apart', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { boxes } = mountGuide([box('notes', 10), box('notes', 10)])
      expect(boxes()).toEqual(['notes', 'notes'])
      // React reports colliding keys through console.error; two boxes rendered
      // without one is the whole assertion.
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
      cleanup()
    }
  })
})
