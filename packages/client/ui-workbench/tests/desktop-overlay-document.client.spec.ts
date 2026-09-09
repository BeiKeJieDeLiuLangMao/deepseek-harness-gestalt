// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/client/index.ts'
import { isDesktopOverlayDocument } from '../src/desktop-overlay-document.ts'

afterEach(() => {
  document.documentElement.removeAttribute('data-dsh-desktop-overlay')
  vi.unstubAllGlobals()
})

describe('isDesktopOverlayDocument', () => {
  it('reads the overlay attribute and query', () => {
    expect(isDesktopOverlayDocument()).toBe(false)
    document.documentElement.setAttribute('data-dsh-desktop-overlay', '')
    expect(isDesktopOverlayDocument()).toBe(true)
    document.documentElement.removeAttribute('data-dsh-desktop-overlay')
    vi.stubGlobal('location', { search: '?dsh-desktop-overlay=1' })
    expect(isDesktopOverlayDocument()).toBe(true)
  })
})

describe('workbench apply on the overlay document', () => {
  it('publishes reveal without registering or reconciling pages', () => {
    document.documentElement.setAttribute('data-dsh-desktop-overlay', '')
    const ctx = new Context()
    const register = vi.fn()
    const subscribeSidebar = vi.fn()
    const subscribeSessions = vi.fn()
    const create = vi.fn()
    ctx.provide('sidebarRightTabs', { register })
    ctx.provide('sidebarRight', { subscribe: subscribeSidebar })
    ctx.provide('sessions', { list: { subscribe: subscribeSessions } })
    ctx.provide('remote', { browserWorkspace: { create } })
    apply(ctx)
    expect(ctx.get('workbenchBrowser')).toEqual({ reveal: expect.any(Function) })
    ctx.workbenchBrowser.reveal('s1')
    expect(register).not.toHaveBeenCalled()
    expect(subscribeSidebar).not.toHaveBeenCalled()
    expect(subscribeSessions).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
