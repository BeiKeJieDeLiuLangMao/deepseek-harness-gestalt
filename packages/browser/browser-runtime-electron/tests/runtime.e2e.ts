import { describe, expect, it } from 'vitest'
import { isElectronProcess } from '@deepseek-ai/dsh-browser-runtime-electron'
import { driveRealPage, isolateCookiesAcrossPartitions } from './runtime.e2e.cases.ts'

// Real-runtime check against this process's Electron. Self-skips on Node
// because the declared launcher is `pnpm run test:electron-runtime-e2e`;
// spawning Tandem.app is out of scope. The unit suite covers the same
// operations through an injected Electron host.
if (process.env.DSH_ELECTRON_RUNTIME_E2E === '1' && !isElectronProcess()) {
  throw new Error(
    'declared Electron runtime e2e launcher must keep process.versions.electron set; unset ELECTRON_RUN_AS_NODE',
  )
}

const electronAvailable = isElectronProcess()

describe.skipIf(!electronAvailable)('Electron Browser Runtime real-runtime e2e', () => {
  it('drives one real page through in-process Electron webContents', async () => {
    await driveRealPage()
  }, 120_000)

  it('types a newline and a non-BMP character and isolates cookies across partitions', async () => {
    await isolateCookiesAcrossPartitions()
  }, 120_000)
})

describe.skipIf(electronAvailable)('Electron Browser Runtime real-runtime e2e skip', () => {
  it('records the named Node skip reason without spawning Tandem', () => {
    expect(isElectronProcess()).toBe(false)
  })
})
