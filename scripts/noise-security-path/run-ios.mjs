/** Build and execute the committed proof in a real iOS Simulator WKWebView. */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const proofRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(proofRoot, '../..')
const project = join(proofRoot, 'runtimes/ios/NoiseProof.xcodeproj')
const derivedData = join(repositoryRoot, '.artifacts/noise-security-path/ios')
const bundleId = 'dev.deepseek.noiseproof'
const devices = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' }))
const selection = Object.entries(devices.devices)
  .flatMap(([runtime, candidates]) => candidates.map(candidate => ({ candidate, runtime })))
  .find(({ candidate }) => candidate.name.startsWith('iPhone'))
if (!selection) throw new Error('No available iOS Simulator iPhone exists')
const { candidate: device, runtime } = selection

const startedDevice = device.state !== 'Booted'
if (startedDevice) {
  execFileSync('xcrun', ['simctl', 'boot', device.udid], { stdio: 'inherit' })
  execFileSync('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], { stdio: 'inherit' })
}
execFileSync('xcodebuild', [
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
spawnSync('xcrun', ['simctl', 'terminate', device.udid, bundleId])
spawnSync('xcrun', ['simctl', 'uninstall', device.udid, bundleId])
execFileSync('xcrun', ['simctl', 'install', device.udid, app], { stdio: 'inherit' })
execFileSync('xcrun', ['simctl', 'launch', device.udid, bundleId], { stdio: 'inherit' })

const deadline = Date.now() + 30_000
let reportPath
while (Date.now() < deadline) {
  const container = spawnSync('xcrun', ['simctl', 'get_app_container', device.udid, bundleId, 'data'], { encoding: 'utf8' })
  if (container.status === 0) {
    const candidate = join(container.stdout.trim(), 'Documents/noise-proof.json')
    if (existsSync(candidate)) {
      reportPath = candidate
      break
    }
  }
  await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
}
spawnSync('xcrun', ['simctl', 'terminate', device.udid, bundleId])
if (!reportPath) {
  spawnSync('xcrun', ['simctl', 'uninstall', device.udid, bundleId])
  if (startedDevice) spawnSync('xcrun', ['simctl', 'shutdown', device.udid])
  throw new Error('iOS WKWebView did not produce a proof report within 30 seconds')
}
const reportText = readFileSync(reportPath, 'utf8')
spawnSync('xcrun', ['simctl', 'uninstall', device.udid, bundleId])
if (startedDevice) spawnSync('xcrun', ['simctl', 'shutdown', device.udid])
if (reportText.startsWith('ERROR:')) throw new Error(reportText)
const report = JSON.parse(reportText)
if (report.runtime !== 'iOS WKWebView') throw new Error('iOS proof returned the wrong runtime label')
if (report.allPass !== true) throw new Error('iOS WKWebView returned a failing proof report')
process.stderr.write(`${device.name} ${runtime.split('.').at(-1)} WKWebView: pass\n`)
process.stdout.write(`${reportText}\n`)
