import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as ElectronBrowserRuntime from '@deepseek-ai/dsh-browser-runtime-electron'
import { installElectronTestHost } from '@deepseek-ai/dsh-browser-runtime-electron'
import { FakeElectronHost } from './fake-electron.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  installElectronTestHost(undefined)
})

describe('Electron Browser Runtime Loader composition', () => {
  it('loads cordis.yml and drives one temporary page through the composed runtime', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-electron-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-browser-runtime-electron'",
      '  config:',
      "    idPrefix: 'loader'",
      '    requestTimeoutMs: 200',
      '',
    ].join('\n'))
    installElectronTestHost(new FakeElectronHost())
    context = new Context()
    context.baseUrl = `${pathToFileURL(root).href}/`
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-browser-runtime-electron', ElectronBrowserRuntime],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()
    const created = await context.browserRuntime.create({ profile: 'temporary' })
    expect(created.chrome.partition).toBe('session-loader-tmp-1')
    expect(created.chrome.partition.startsWith('persist:')).toBe(false)
    const typed = await context.browserRuntime.input({
      target: created.target,
      expectedRevision: created.revision,
      url: 'https://example.test/',
      text: 'typed',
    })
    expect(typed.text).toBe('An Electron protocol page.typed')
    const closed = await context.browserRuntime.close({
      target: created.target,
      expectedRevision: typed.revision,
    })
    expect(closed).toMatchObject({ status: 'closed', revision: 2 })
  })
})
