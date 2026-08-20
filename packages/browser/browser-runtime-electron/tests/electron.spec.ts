import { describe, expect, it, vi } from 'vitest'
import { electronHostFromModule, isElectronProcess, loadElectronHost, requireElectronProcess } from '../src/electron.ts'

describe('Electron process detection', () => {
  it('requires a non-empty process.versions.electron string', () => {
    expect(isElectronProcess({ node: '22.19.0' } as NodeJS.ProcessVersions)).toBe(false)
    expect(isElectronProcess({ electron: '' } as NodeJS.ProcessVersions)).toBe(false)
    expect(isElectronProcess({ electron: '41.2.1' } as NodeJS.ProcessVersions)).toBe(true)
    expect(() => { requireElectronProcess({ node: '22.19.0' } as NodeJS.ProcessVersions) })
      .toThrow(/process.versions.electron must be set/)
  })

  it('loads BrowserWindow and session from the Electron module', async () => {
    vi.resetModules()
    vi.doMock('electron', () => ({
      BrowserWindow: function BrowserWindow() {},
      session: { fromPartition: () => ({}) },
    }))
    const { loadElectronHost: load } = await import('../src/electron.ts')
    const originalElectron = process.versions.electron
    Object.defineProperty(process.versions, 'electron', { value: '41.2.1', configurable: true })
    const host = await load()
    expect(typeof host.BrowserWindow).toBe('function')
    expect(typeof host.session.fromPartition).toBe('function')
    Object.defineProperty(process.versions, 'electron', { value: originalElectron, configurable: true })
    vi.doUnmock('electron')
    vi.resetModules()
  })

  it('rejects a non-object Electron module export', () => {
    expect(() => { electronHostFromModule(null) }).toThrow(/did not expose BrowserWindow and session/)
    expect(() => { electronHostFromModule(7) }).toThrow(/did not expose BrowserWindow and session/)
  })

  it('rejects an Electron module that omits BrowserWindow or session', async () => {
    vi.resetModules()
    vi.doMock('electron', () => ({ BrowserWindow: undefined, session: undefined }))
    const { loadElectronHost: load } = await import('../src/electron.ts')
    const originalElectron = process.versions.electron
    Object.defineProperty(process.versions, 'electron', { value: '41.2.1', configurable: true })
    await expect(load()).rejects.toThrow(/did not expose BrowserWindow and session/)
    Object.defineProperty(process.versions, 'electron', { value: originalElectron, configurable: true })
    vi.doUnmock('electron')
    vi.resetModules()
  })

  it('loads Electron APIs from the Provider when no host is injected', async () => {
    const originalElectron = process.versions.electron
    Object.defineProperty(process.versions, 'electron', { value: '41.2.1', configurable: true })
    vi.resetModules()
    vi.doMock('electron', () => ({
      BrowserWindow: function BrowserWindow() {},
      session: { fromPartition: () => ({}) },
    }))
    const { default: Runtime } = await import('../src/index.ts')
    const { Context } = await import('@deepseek-ai/cordis')
    const ctx = new Context()
    await ctx.plugin(Runtime, { idPrefix: 'loaded' })
    const internals = ctx.browserRuntime as unknown as {
      hostApis(): Promise<{ BrowserWindow: unknown; session: { fromPartition: unknown } }>
    }
    const host = await internals.hostApis()
    expect(typeof host.BrowserWindow).toBe('function')
    expect(typeof host.session.fromPartition).toBe('function')
    await ctx.fiber.dispose()
    Object.defineProperty(process.versions, 'electron', { value: originalElectron, configurable: true })
    vi.doUnmock('electron')
    vi.resetModules()
  })

  it('refuses to import Electron on a Node process', async () => {
    const originalElectron = process.versions.electron
    Object.defineProperty(process.versions, 'electron', { value: undefined, configurable: true })
    await expect(loadElectronHost()).rejects.toThrow(/process.versions.electron must be set/)
    Object.defineProperty(process.versions, 'electron', { value: originalElectron, configurable: true })
  })
})
