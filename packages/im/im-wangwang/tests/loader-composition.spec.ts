/**
 * REAL Loader composition test for @deepseek-ai/dsh-im-wangwang:
 * Boots a keyless cordis.yml through the real Cordis Loader and StorageDomain,
 * proving configured admitted merchant directory, CredentialRef resolution,
 * and service injection.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as imWangwangModule from '@deepseek-ai/dsh-im-wangwang'
import WangwangAdapterService from '@deepseek-ai/dsh-im-wangwang'

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

function runLoaderDriver(cwd: string, configPath: string, storageFile: string) {
  const result = spawnSync(process.execPath, [
    '--import',
    tsxLoader,
    driverPath,
    configPath,
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

describe('im-wangwang real Loader cordis.yml composition', () => {
  it('preserves plugin contract through Loader unwrapExports', () => {
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(imWangwangModule) as typeof WangwangAdapterService
    expect(unwrapped).toBe(WangwangAdapterService)
    expect(unwrapped.inject).toEqual(['credentials', 'storageDomain', 'imDelivery'])
  })

  it('boots through real cordis.yml Loader and verifies admitted merchant configuration', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-im-wangwang-loader-'))
    roots.push(tempDir)
    const storageFile = join(tempDir, 'storage-wangwang.json')
    const configPath = join(tempDir, 'cordis.yml')

    const yml = [
      "- name: '@deepseek-ai/dsh-storage'",
      `- name: '${backendFixtureUrl}'`,
      "- name: '@deepseek-ai/dsh-storage-domain'",
      '  config:',
      "    backend: 'memory'",
      "- name: '@deepseek-ai/dsh-im-core'",
      "- name: '@deepseek-ai/dsh-im-core/delivery'",
      "- name: '@deepseek-ai/dsh-im-wangwang'",
      '  config:',
      "    endpoint: 'https://openapi.test.fliggy.com'",
      '    admittedMerchants:',
      "      - merchantId: 'merchant_loader_01'",
      "        accountId: 'acc-loader-ww-1'",
      "        displayName: 'Loader Wangwang Merchant'",
      "        accessKeyRef: 'WANGWANG_TEST_AK'",
      "        secretKeyRef: 'WANGWANG_TEST_SK'",
      "        mainServiceAccountId: 'kefu_01'",
      '',
    ].join('\n')
    await writeFile(configPath, yml)

    runLoaderDriver(tempDir, configPath, storageFile)

    const report = JSON.parse(await readFile(join(tempDir, 'wangwang-loader-report.json'), 'utf8')) as Record<string, unknown>
    expect(report).toEqual({
      success: true,
      merchantId: 'merchant_loader_01',
      accountId: 'acc-loader-ww-1',
      displayName: 'Loader Wangwang Merchant',
    })
  })
})
