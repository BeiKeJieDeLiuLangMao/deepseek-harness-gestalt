/** Single-installation WebdriverIO config for one critical-path Electron phase. */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { browser } from '@wdio/globals'
import type {} from '@wdio/native-types'
import { recordProcessEvidence } from './artifact-io.ts'
import type { CriticalPathPhase } from './keyless-model.ts'

const desktopRoot = join(import.meta.dirname, '..', '..')
const artifactRoot = required('DSH_CRITICAL_PATH_ARTIFACT_DIR')
const phase = criticalPathPhase()
const phaseRoot = join(artifactRoot, phase)

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./electron.e2e.ts'],
  maxInstances: 1,
  logLevel: 'info',
  outputDir: join(phaseRoot, 'wdio'),
  waitforTimeout: 30_000,
  connectionRetryTimeout: 180_000,
  connectionRetryCount: 1,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 300_000 },
  services: [['electron', { cdpBridgeTimeout: 120_000 }]],
  capabilities: [{
    browserName: 'electron',
    'wdio:electronServiceOptions': {
      appEntryPoint: join(desktopRoot, 'out', 'main.mjs'),
      appArgs: [
        `--user-data-dir=${required('DSH_CRITICAL_PATH_USER_DATA')}`,
        `--dsh-e2e-profile=${required('DSH_CRITICAL_PATH_PROFILE')}`,
        '--lang=en-US',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
      captureMainProcessLogs: true,
      captureRendererLogs: true,
      logDir: join(phaseRoot, 'electron-logs'),
    },
  }],
  before: async () => {
    await recordProcessEvidence(artifactRoot, phase, {
      electronPid: await browser.electron.execute(() => process.pid),
    })
  },
  afterTest: async (test, _context, result) => {
    await mkdir(phaseRoot, { recursive: true })
    const slug = test.title.replaceAll(/[^a-z0-9]+/giu, '-').replaceAll(/^-|-$/gu, '').toLowerCase()
    const skipped = test.pending || result.skipped === true
    await writeFile(join(phaseRoot, 'test-result.json'), JSON.stringify({
      title: test.title,
      tests: 1,
      passed: skipped ? 0 : Number(result.passed),
      failed: skipped ? 0 : Number(!result.passed),
      skipped: Number(skipped),
    }, undefined, 2) + '\n')
    try {
      await browser.saveScreenshot(join(phaseRoot, `${slug}-${result.passed ? 'pass' : 'fail'}.png`))
    } catch (error) {
      throw new Error(`Critical-path ${phase} screenshot capture failed`, { cause: error })
    }
  },
}

function criticalPathPhase(): CriticalPathPhase {
  const value = required('DSH_CRITICAL_PATH_PHASE')
  if (value === 'create' || value === 'restore' || value === 'archive') return value
  throw new TypeError(`DSH_CRITICAL_PATH_PHASE is invalid: ${value}`)
}

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new TypeError(`${name} is required`)
  return value
}
