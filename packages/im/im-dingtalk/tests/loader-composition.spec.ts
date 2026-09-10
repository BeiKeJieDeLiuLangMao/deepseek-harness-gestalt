/**
 * REAL Loader composition test for @deepseek-ai/dsh-im-dingtalk:
 * Boots a keyless cordis.yml through the real Cordis Loader, StorageDomain, and ImDelivery,
 * proving:
 * 1. Package resolution of @deepseek-ai/dsh-im-dingtalk by the real Cordis Loader.
 * 2. Successful wiring of ctx.imDingtalk with injected dependencies (subprocess, imConfig, imDelivery).
 * 3. Two distinct OS processes executing write then read against real StorageDomain state.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as imDingtalkModule from '@deepseek-ai/dsh-im-dingtalk'
import DingTalkDwsAdapterServiceImpl from '@deepseek-ai/dsh-im-dingtalk'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const backendFixturePath = join(import.meta.dirname, '../../im-core/tests/memory-backend-fixture.ts')
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

describe('im-dingtalk real Loader cordis.yml composition and multi-process lifecycle', () => {
  it('preserves plugin contract through Loader unwrapExports', () => {
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(imDingtalkModule) as typeof DingTalkDwsAdapterServiceImpl
    expect(unwrapped).toBe(DingTalkDwsAdapterServiceImpl)
    expect(unwrapped.name).toBe('DingTalkDwsAdapterServiceImpl')
    expect(unwrapped.inject).toEqual(['subprocess', 'imConfig', 'imDelivery'])
  })

  it('boots through real cordis.yml Loader and verifies adapter across two distinct OS processes', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-im-dt-proc-'))
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
      "- name: '@deepseek-ai/dsh-im-core/delivery'",
      "- name: '@deepseek-ai/dsh-im-dingtalk'",
      '  config:',
      "    dwsPath: 'dws'",
      "    profile: 'testCorp'",
      '',
    ].join('\n')
    await writeFile(configPath, yml)

    // Process 1: boots through real Loader, persists account, starts consumer, sends message
    runLoaderDriver(tempDir, configPath, storageFile, 'write')

    const report1 = JSON.parse(await readFile(join(tempDir, 'dt-loader-report.json'), 'utf8'))
    expect(report1).toEqual({
      phase: 'write',
      accountId: 'acc-loader-dingtalk-1',
      consumerRunning: true,
      sendSuccess: true,
      openTaskId: 'dt-loader-task-1',
    })

    // Process 2: boots second fresh OS process, reloads storage state, queries send status
    runLoaderDriver(tempDir, configPath, storageFile, 'read')

    const report2 = JSON.parse(await readFile(join(tempDir, 'dt-loader-report.json'), 'utf8'))
    expect(report2).toEqual({
      phase: 'read',
      accountExists: true,
      accountDisplayName: 'Loader DingTalk Integration Account',
      queryStatus: 'sent',
    })
  })
})
