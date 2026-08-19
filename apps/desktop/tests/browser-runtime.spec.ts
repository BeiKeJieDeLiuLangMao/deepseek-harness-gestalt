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
  it('isolates partition files under Electron userData and never writes Tandem Browser Application Support', async () => {
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
      listenElectronBrowserHttp: async (options: { tokenFile: string }) => ({
        origin: 'http://127.0.0.1:34567',
        tokenFile: options.tokenFile,
        close: async () => { closed.push('http') },
      }),
    }))
    const { startDesktopBrowserRuntime } = await import('../src/browser-runtime.ts')
    const runtime = await startDesktopBrowserRuntime(userData)
    expect(runtime.origin).toBe('http://127.0.0.1:34567')
    expect(runtime.tokenFile).toBe(join(userData, 'browser-runtime', 'api-token'))
    expect(runtime.partitionRoot).toBe(join(userData, 'browser-runtime'))
    expect(runtime.partitionRoot).not.toContain('Tandem Browser')
    await runtime.dispose()
    expect(closed).toEqual(['plugin', 'http', 'fiber'])
  })
})
