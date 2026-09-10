/**
 * REAL Loader composition test for @deepseek-ai/dsh-im-core:
 * Boots a keyless cordis.yml through the real Cordis Loader and StorageDomain,
 * proving configured accounts, route rules, simulation target gating, and persistence reload.
 *
 * Resolved by the real Cordis Loader through standard package resolution
 * without any loader.internal or import map shims.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as imCoreModule from '@deepseek-ai/dsh-im-core'
import ImConfigService from '@deepseek-ai/dsh-im-core'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const backendFixturePath = join(import.meta.dirname, 'memory-backend-fixture.ts')
const backendFixtureUrl = pathToFileURL(backendFixturePath).href
const driverPath = join(import.meta.dirname, 'fixtures/driver.ts')
const repoRoot = join(import.meta.dirname, '../../../..')
const tsconfigPath = join(repoRoot, 'tsconfig.json')
const tsxLoader = import.meta.resolve('tsx/esm')

function runLoaderDriver(cwd: string, configPath: string, storageFile: string, action: 'write' | 'read') {
  const result = spawnSync(process.execPath, [
    '--import',
    tsxLoader,
    driverPath,
    configPath,
    action,
  ], {
    cwd,
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: tsconfigPath,
      DSH_IM_TEST_STORAGE_FILE: storageFile,
    },
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`Loader driver failed (exit ${String(result.status)}): ${result.stderr || result.stdout}`)
  }
  return result
}

describe('im-core real Loader cordis.yml composition and persistence reload', () => {
  it('preserves plugin contract through Loader unwrapExports', () => {
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(imCoreModule) as typeof ImConfigService
    expect(unwrapped).toBe(ImConfigService)
    expect(unwrapped.name).toBe('ImConfigService')
    expect(unwrapped.inject).toEqual(['storageDomain'])
  })

  it('boots through real cordis.yml Loader, persists config, and reloads across two distinct processes', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-im-proc-'))
    roots.push(tempDir)
    const storageFile = join(tempDir, 'storage-proc.json')
    const configPath = join(tempDir, 'cordis.yml')

    const yml = [
      "- name: '@deepseek-ai/dsh-storage'",
      `- name: '${backendFixtureUrl}'`,
      "- name: '@deepseek-ai/dsh-storage-domain'",
      '  config:',
      "    backend: 'memory'",
      "- name: '@deepseek-ai/dsh-im-core'",
      '',
    ].join('\n')
    await writeFile(configPath, yml)

    // Process 1: boots through real Loader and writes accounts & rules
    runLoaderDriver(tempDir, configPath, storageFile, 'write')

    const report1 = JSON.parse(await readFile(join(tempDir, 'im-loader-report.json'), 'utf8'))
    expect(report1).toEqual({
      phase: 'write',
      accountId: 'acc-loader-dt',
      ruleId: 'rule-loader-1',
      workspaceId: 'ws-loader-1',
      routeStatus: 'matched',
    })

    // Process 2: boots another fresh process through real Loader and reloads config
    runLoaderDriver(tempDir, configPath, storageFile, 'read')

    const report2 = JSON.parse(await readFile(join(tempDir, 'im-loader-report.json'), 'utf8'))
    expect(report2.account).toMatchObject({
      id: 'acc-loader-dt',
      platform: 'dingtalk',
      displayName: 'Loader DingTalk Account',
      credentialRef: 'CRED_LOADER_TOKEN',
      status: 'connected',
      paused: false,
    })
    expect(report2.rule).toMatchObject({
      id: 'rule-loader-1',
      workspaceId: 'ws-loader-1',
      enabled: true,
      groupTrigger: { mention: true, everyN: 3 },
    })
    expect(report2.sim).toMatchObject({
      workspaceId: 'ws-loader-1',
      targetAccountId: 'acc-loader-dt',
      conversationKind: 'group',
    })
    expect(report2.route).toEqual({
      status: 'matched',
      ruleId: 'rule-loader-1',
      workspaceId: 'ws-loader-1',
      enabled: true,
      groupTrigger: { mention: true, everyN: 3 },
    })
  })
})
