// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobilePairing, type MobilePairingActions } from '../src/MobilePairing.tsx'

afterEach(cleanup)

describe('MobilePairing', () => {
  it('uses a complete link or QR and shows Desktop-matching authentication words', () => {
    let snapshot: ReturnType<MobilePairingActions['getSnapshot']> = { status: 'ready' }
    const completeLink = vi.fn()
    const actions: MobilePairingActions = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      completeLink,
      scanQr: vi.fn(),
      retryPairing: vi.fn(),
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
      unpair: vi.fn().mockResolvedValue(undefined),
    }
    const { rerender } = render(createElement(MobilePairing, { actions }))
    const link = 'https://platform.example.com/pair?secret=complete-high-entropy-invitation'
    fireEvent.change(screen.getByRole('textbox', { name: '完整的一次性配对链接' }), { target: { value: link } })
    fireEvent.click(screen.getByRole('button', { name: '继续配对' }))
    expect(completeLink).toHaveBeenCalledWith(link)
    expect(screen.queryByLabelText(/manual|短码/i)).toBeNull()

    snapshot = {
      status: 'pending', deviceName: 'Alice phone',
      authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
    }
    rerender(createElement(MobilePairing, { actions }))
    expect(screen.getByText('amber binary cedar delta ember frost')).toBeTruthy()
    expect(screen.getByText('请在 Desktop 确认后继续')).toBeTruthy()
  })

  it('offers an explicit retry for a retained pairing attempt', () => {
    const retryPairing = vi.fn()
    const snapshot = { status: 'retryable', error: 'completion response was lost' } as const
    const actions: MobilePairingActions = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      completeLink: vi.fn(),
      scanQr: vi.fn(),
      retryPairing,
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
      unpair: vi.fn().mockResolvedValue(undefined),
    }

    render(createElement(MobilePairing, { actions }))
    expect(screen.getByRole('alert').textContent).toContain('completion response was lost')
    fireEvent.click(screen.getByRole('button', { name: '重试配对' }))
    expect(retryPairing).toHaveBeenCalledOnce()
  })

  it('activates on mount and awaits lifecycle deactivation on unmount', async () => {
    const activate = vi.fn().mockResolvedValue(undefined)
    const deactivate = vi.fn().mockResolvedValue(undefined)
    const snapshot = { status: 'ready' } as const
    const actions: MobilePairingActions = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      completeLink: vi.fn(),
      scanQr: vi.fn(),
      retryPairing: vi.fn(),
      activate,
      deactivate,
      unpair: vi.fn().mockResolvedValue(undefined),
    }
    const rendered = render(createElement(MobilePairing, { actions }))
    expect(activate).toHaveBeenCalledOnce()
    rendered.unmount()
    expect(deactivate).toHaveBeenCalledOnce()
  })
})
