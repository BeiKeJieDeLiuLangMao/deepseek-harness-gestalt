/** Build and execute the committed proof in a real iOS Simulator WKWebView. */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CleanupStack, requireSpawnSuccess } from './runner-support.mjs'

const proofRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(proofRoot, '../..')
const project = join(proofRoot, 'runtimes/ios/NoiseProof.xcodeproj')
const derivedData = join(repositoryRoot, '.artifacts/noise-security-path/ios')
const bundleId = 'dev.deepseek.noiseproof'

const defaultCommands = { execFileSync, spawnSync }
const defaultClock = {
  now: Date.now,
  sleep: delay => new Promise(resolvePromise => setTimeout(resolvePromise, delay)),
}

/**
 * Execute the iOS proof with injectable command and clock adapters.
 * @param {object} overrides Test-only adapters for commands, files, and time.
 * @returns {Promise<{ reportText: string, status: string }>}
 */
export async function runIosProof(overrides = {}) {
  const commands = overrides.commands ?? defaultCommands
  const clock = overrides.clock ?? defaultClock
  const files = overrides.files ?? { existsSync, readFileSync }
  const devices = JSON.parse(commands.execFileSync(
    'xcrun',
    ['simctl', 'list', 'devices', 'available', '--json'],
    { encoding: 'utf8' },
  ))
  const selection = Object.entries(devices.devices)
    .flatMap(([runtime, candidates]) => candidates.map(candidate => ({ candidate, runtime })))
    .find(({ candidate }) => candidate.name.startsWith('iPhone'))
  if (!selection) throw new Error('No available iOS Simulator iPhone exists')
  const { candidate: device, runtime } = selection
  const cleanup = new CleanupStack()
  let primaryError
  let result

  try {
    if (device.state !== 'Booted') {
      cleanup.defer('wait for iOS Simulator shutdown', () => waitForSimulatorShutdown(
        commands,
        clock,
        device.udid,
      ))
      cleanup.defer('shut down iOS Simulator', () => {
        requireSpawnSuccess(
          commands.spawnSync('xcrun', ['simctl', 'shutdown', device.udid]),
          'simctl shutdown',
        )
      })
      commands.execFileSync('xcrun', ['simctl', 'boot', device.udid], { stdio: 'inherit' })
      commands.execFileSync('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], {
        stdio: 'inherit',
      })
    }

    cleanup.defer('uninstall iOS proof app', () => {
      requireSpawnSuccess(
        commands.spawnSync('xcrun', ['simctl', 'uninstall', device.udid, bundleId]),
        'simctl uninstall',
      )
    })
    cleanup.defer('terminate iOS proof app', () => {
      requireSpawnSuccess(
        commands.spawnSync('xcrun', ['simctl', 'terminate', device.udid, bundleId]),
        'simctl terminate',
      )
    })
    commands.execFileSync('xcodebuild', [
      '-project', project,
      '-scheme', 'NoiseProof',
      '-configuration', 'Debug',
      '-sdk', 'iphonesimulator',
      '-destination', `platform=iOS Simulator,id=${device.udid}`,
      '-derivedDataPath', derivedData,
      '-quiet',
      'CODE_SIGNING_ALLOWED=NO',
      'build',
    ], { cwd: repositoryRoot, stdio: 'inherit' })
    const app = join(derivedData, 'Build/Products/Debug-iphonesimulator/NoiseProof.app')

    commands.execFileSync('xcrun', ['simctl', 'install', device.udid, app], { stdio: 'inherit' })
    commands.execFileSync('xcrun', ['simctl', 'launch', device.udid, bundleId], {
      stdio: 'inherit',
    })

    const deadline = clock.now() + 30_000
    let reportPath
    while (clock.now() < deadline) {
      const container = commands.spawnSync(
        'xcrun',
        ['simctl', 'get_app_container', device.udid, bundleId, 'data'],
        { encoding: 'utf8' },
      )
      if (container.status === 0) {
        const candidate = join(container.stdout.trim(), 'Documents/noise-proof.json')
        if (files.existsSync(candidate)) {
          reportPath = candidate
          break
        }
      }
      await clock.sleep(250)
    }
    if (!reportPath) {
      throw new Error('iOS WKWebView did not produce a proof report within 30 seconds')
    }
    const reportText = files.readFileSync(reportPath, 'utf8')
    if (reportText.startsWith('ERROR:')) throw new Error(reportText)
    const report = JSON.parse(reportText)
    if (report.runtime !== 'iOS WKWebView') {
      throw new Error('iOS proof returned the wrong runtime label')
    }
    if (report.allPass !== true) throw new Error('iOS WKWebView returned a failing proof report')
    result = {
      reportText,
      status: `${device.name} ${runtime.split('.').at(-1)} WKWebView: pass`,
    }
  } catch (error) {
    primaryError = error
  }

  await cleanup.finish(primaryError)
  return result
}

/**
 * Wait until a runner-owned Simulator reports the stationary Shutdown state.
 * @param {{ execFileSync: typeof execFileSync }} commands Command adapter.
 * @param {{ now: () => number, sleep: (delay: number) => Promise<void> }} clock Clock adapter.
 * @param {string} udid Simulator identifier.
 * @returns {Promise<void>}
 */
async function waitForSimulatorShutdown(commands, clock, udid) {
  const deadline = clock.now() + 30_000
  while (clock.now() < deadline) {
    const devices = JSON.parse(commands.execFileSync(
      'xcrun',
      ['simctl', 'list', 'devices', udid, '--json'],
      { encoding: 'utf8' },
    ))
    const device = Object.values(devices.devices).flat().find(candidate => candidate.udid === udid)
    if (device?.state === 'Shutdown') return
    await clock.sleep(250)
  }
  throw new Error(`iOS Simulator ${udid} did not reach Shutdown within 30 seconds`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { reportText, status } = await runIosProof()
  process.stderr.write(`${status}\n`)
  process.stdout.write(`${reportText}\n`)
}
