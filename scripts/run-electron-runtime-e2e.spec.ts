import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bundleElectronRuntimeE2eCases,
  electronRuntimeE2eChildEnv,
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
    }) as unknown) as NodeJS.Require)).toThrow(/electron package did not resolve to a binary/)
  })

  it('fails loud when the electron package does not expose a path', () => {
    expect(() => resolveElectronBinary(((() => undefined) as unknown) as NodeJS.Require))
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
    expect(electronRuntimeE2eMainArgs('win32')).toEqual([
      '--no-sandbox',
      '--disable-gpu',
      main,
    ])
  })

  it.each(['1', 'true'])('rejects ELECTRON_RUN_AS_NODE=%s before spawning Electron', async (value) => {
    process.env.ELECTRON_RUN_AS_NODE = value
    await expect(runElectronRuntimeE2e()).rejects.toThrow(/ELECTRON_RUN_AS_NODE is set/)
  })

  it('drops NODE_OPTIONS so a parent tsx import does not become Electron argv', () => {
    const env = electronRuntimeE2eChildEnv({
      PATH: '/bin',
      NODE_OPTIONS: '--import tsx/esm',
    })
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env.DSH_ELECTRON_RUNTIME_E2E).toBe('1')
    expect(env.ELECTRON_ENABLE_LOGGING).toBe('1')
  })

  it('bundles TypeScript cases as ESM with electron left external', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-electron-runtime-e2e-bundle-spec-'))
    const outfile = join(dir, 'runtime.e2e.cases.mjs')
    try {
      await bundleElectronRuntimeE2eCases(outfile)
      const source = readFileSync(outfile, 'utf8')
      expect(source).toContain('runElectronRuntimeE2eCases')
      expect(source).toContain('import("electron")')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
