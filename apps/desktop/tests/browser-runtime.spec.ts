import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const temps: string[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  vi.resetModules()
  vi.doUnmock('@deepseek-ai/dsh-browser-runtime-electron')
  vi.doUnmock('@deepseek-ai/cordis')
})

describe('startDesktopBrowserRuntime', () => {
  it('stores the loopback token under userData and never writes Tandem Browser Application Support', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'dsh-desktop-browser-'))
    temps.push(userData)
    const closed: string[] = []
    vi.doMock('@deepseek-ai/cordis', () => ({
      Context: class {
        browserRuntime = { name: 'electron' }
        fiber = { dispose: async () => { closed.push('fiber') } }
        async plugin(): Promise<void> { closed.push('plugin') }
      },
    }))
    vi.doMock('@deepseek-ai/dsh-browser-runtime-electron', () => ({
      default: function ElectronBrowserRuntime() {},
      listenElectronBrowserHttp: async (options: { tokenFile: string; idPrefix?: string }) => {
        expect(options.idPrefix).toBe('gestalt')
        return {
          origin: 'http://127.0.0.1:34567',
          tokenFile: options.tokenFile,
          close: async () => { closed.push('http') },
        }
      },
    }))
    const { startDesktopBrowserRuntime } = await import('../src/browser-runtime.ts')
    const runtime = await startDesktopBrowserRuntime(userData)
    expect(runtime.origin).toBe('http://127.0.0.1:34567')
    expect(runtime.tokenFile).toBe(join(userData, 'browser-runtime', 'api-token'))
    expect(runtime.tokenDir).toBe(join(userData, 'browser-runtime'))
    expect(runtime.tokenDir).not.toContain('Tandem Browser')
    await runtime.dispose()
    expect(closed).toEqual(['plugin', 'http', 'fiber'])
  })

  it('disposes the Electron fiber when the HTTP listener fails after plugin()', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'dsh-desktop-browser-fail-'))
    temps.push(userData)
    const closed: string[] = []
    vi.doMock('@deepseek-ai/cordis', () => ({
      Context: class {
        browserRuntime = { name: 'electron' }
        fiber = { dispose: async () => { closed.push('fiber') } }
        async plugin(): Promise<void> { closed.push('plugin') }
      },
    }))
    vi.doMock('@deepseek-ai/dsh-browser-runtime-electron', () => ({
      default: function ElectronBrowserRuntime() {},
      listenElectronBrowserHttp: async () => {
        throw new Error('bind failed')
      },
    }))
    const { startDesktopBrowserRuntime } = await import('../src/browser-runtime.ts')
    await expect(startDesktopBrowserRuntime(userData)).rejects.toThrow('bind failed')
    expect(closed).toEqual(['plugin', 'fiber'])
  })
})
