import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  electronRuntimeE2eMainArgs,
  resolveElectronBinary,
  runElectronRuntimeE2e,
} from './run-electron-runtime-e2e.ts'

const here = dirname(fileURLToPath(import.meta.url))

describe('declared Electron runtime e2e launcher', () => {
  const previousRunAsNode = process.env.ELECTRON_RUN_AS_NODE

  afterEach(() => {
    if (previousRunAsNode === undefined) Reflect.deleteProperty(process.env, 'ELECTRON_RUN_AS_NODE')
    else process.env.ELECTRON_RUN_AS_NODE = previousRunAsNode
  })

  it('resolves the Electron binary from the Browser Runtime Electron package', () => {
    const binary = resolveElectronBinary()
    expect(binary.length).toBeGreaterThan(0)
    expect(binary).toMatch(/electron/i)
  })

  it('fails loud when the electron package is missing', () => {
    expect(() => resolveElectronBinary(((() => {
      throw new Error('Cannot find module')
    }) as unknown) as NodeRequire)).toThrow(/electron package did not resolve to a binary/)
  })

  it('fails loud when the electron package does not expose a path', () => {
    expect(() => resolveElectronBinary(((() => undefined) as unknown) as NodeRequire))
      .toThrow(/electron package did not resolve to a binary/)
  })

  it('points Electron at the declared application main after host Chromium switches', () => {
    const main = join(here, 'electron-runtime-e2e-main.mjs')
    expect(electronRuntimeE2eMainArgs('darwin')).toEqual([main])
    expect(electronRuntimeE2eMainArgs('linux')).toEqual([
      '--no-sandbox',
      '--disable-dev-shm-usage',
      main,
    ])
    expect(electronRuntimeE2eMainArgs('win32')).toEqual(['--no-sandbox', '--disable-gpu', main])
  })

  it.each(['1', 'true'])('rejects ELECTRON_RUN_AS_NODE=%s before spawning Electron', async (value) => {
    process.env.ELECTRON_RUN_AS_NODE = value
    await expect(runElectronRuntimeE2e()).rejects.toThrow(/ELECTRON_RUN_AS_NODE is set/)
  })
})
