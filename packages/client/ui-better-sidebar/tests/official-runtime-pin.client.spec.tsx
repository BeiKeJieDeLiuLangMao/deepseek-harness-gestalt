// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createOfficialUiTerminalPayload } from '../src/client/official-runtime/payload.ts'
import { OfficialTerminalPinMenuItem } from '../src/client/official-runtime/TerminalPinMenuItem.tsx'
import type { OfficialTerminalPinMenuItemProps } from '../src/client/official-runtime/TerminalPinMenuItem.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function props(pin?: { scope: 'workspace' | 'global'; homeSessionId: ReturnType<typeof SessionId>; homeCwd?: string }) {
  const update = vi.fn()
  const dismiss = vi.fn()
  const value = {
    ctx: {
      sessions: { list: { getSnapshot: () => ({
        current: SessionId('session-b'),
        byId: { 'session-a': { id: SessionId('session-a'), displayTitle: 'A', cwd: '/workspace/a' } },
      }) } },
    },
    sessionId: SessionId('session-a'),
    surface: 'right',
    tab: { id: 'terminal-tab', kind: 'terminal', contentId: 'sidebar://terminal/one', title: 'zsh' },
    payload: createOfficialUiTerminalPayload('terminal:one'),
    pin,
    actions: { update },
    dismiss,
  } as unknown as OfficialTerminalPinMenuItemProps
  return { value, update, dismiss }
}

describe('official Terminal pin menu', () => {
  it('pins the home occurrence to its workspace or globally', () => {
    const workspace = props()
    const workspaceView = render(<OfficialTerminalPinMenuItem {...workspace.value} />)
    fireEvent.click(workspaceView.container.querySelector('[data-official-terminal-pin="workspace"]')!)
    expect(workspace.update).toHaveBeenCalledWith({
      pin: {
        scope: 'workspace',
        homeSessionId: 'session-a',
        homeCwd: '/workspace/a',
      },
    })
    expect(workspace.dismiss).toHaveBeenCalledOnce()

    workspaceView.unmount()
    const global = props()
    const globalView = render(<OfficialTerminalPinMenuItem {...global.value} />)
    fireEvent.click(globalView.container.querySelector('[data-official-terminal-pin="global"]')!)
    expect(global.update).toHaveBeenCalledWith({
      pin: { scope: 'global', homeSessionId: 'session-a' },
    })
    expect(global.dismiss).toHaveBeenCalledOnce()
  })

  it('unpins a foreign virtual view through its home actions without closing the PTY', () => {
    const pinned = props({
      scope: 'global',
      homeSessionId: SessionId('session-a'),
    })
    const view = render(<OfficialTerminalPinMenuItem {...pinned.value} />)
    fireEvent.click(view.container.querySelector('[data-official-terminal-pin="remove"]')!)

    expect(pinned.update).toHaveBeenCalledWith({ pin: undefined })
    expect(pinned.dismiss).toHaveBeenCalledOnce()
  })

  it('contributes no actions for a non-Terminal payload', () => {
    const item = props()
    const view = render(<OfficialTerminalPinMenuItem {...item.value} payload={{ kind: 'other' } as never} />)
    expect(view.container.innerHTML).toBe('')
  })
})
