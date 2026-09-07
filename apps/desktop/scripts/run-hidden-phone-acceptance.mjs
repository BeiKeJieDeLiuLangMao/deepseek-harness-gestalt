#!/usr/bin/env node
/** One prebuilt, hidden, click-only Desktop lane. No build or dependency installation. */
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  rejectCredentialFallbacks, verifyAcceptanceInventory, verifyAcceptanceManifest, verifyShutdownEvidence,
} from './hidden-acceptance-contract.mjs'
import { ownAcceptanceChild } from './hidden-acceptance-owner.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktop = join(root, 'apps/desktop')
const wdio = join(desktop, 'node_modules/@wdio/cli/bin/wdio.js')
const electron = join(desktop, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const operatedPlatformSource = join(desktop, 'tests/fixtures/operated-platform.json')
const operatedPlatformOutput = join(desktop, 'out/operated-platform.json')
const hostEntry = join(root, 'apps/cli/src/bin.ts')
const clientEntry = join(root, 'packages/client/web/lib/index.js')
const webEntry = join(root, 'apps/web/dist/index.html')
const [manifestPath, inventoryPath] = process.argv.slice(2)
if (!manifestPath || !inventoryPath || process.env.DSH_610_REVIEWED_LAUNCH !== '1') {
  throw new Error('After root review: DSH_610_REVIEWED_LAUNCH=1 node apps/desktop/scripts/run-hidden-phone-acceptance.mjs BUILD-MANIFEST.json FRESH-INVENTORY.json')
}
if (process.platform !== 'darwin') throw new Error('This bounded acceptance lane requires macOS process inventory')
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
if (!existsSync(wdio)) throw new Error('install-free prerequisite missing: Desktop WDIO dependencies')
if (!existsSync(electron)) throw new Error('install-free prerequisite missing: Desktop Electron executable')
const directInputs = [
  join(desktop, 'out/main.mjs'), join(desktop, 'out/preload.cjs'), operatedPlatformOutput,
  join(desktop, 'out/boot.html'), join(desktop, 'out/relay-node-helper.cjs'),
  join(desktop, 'out/system-node-fetch-helper.cjs'), join(desktop, 'out/sub2api-sources.json'),
  join(desktop, 'out/build/icon.png'), join(desktop, 'scripts/build-main.mjs'),
  join(desktop, 'cordis.patch.yml'), hostEntry, clientEntry, webEntry,
  join(root, 'node_modules/tsx/dist/esm/index.mjs'), operatedPlatformSource,
  join(desktop, 'tests/fixtures/phone-e2e-devices.json'),
  join(desktop, 'tests/e2e-electron/wdio.conf.ts'), join(desktop, 'tests/e2e-electron/helpers.ts'),
  join(desktop, 'tests/e2e-electron/phone-playback-acceptance.e2e.ts'),
  join(desktop, 'scripts/e2e-electron-runner-support.mjs'),
  join(desktop, 'scripts/run-hidden-phone-acceptance.mjs'),
  join(desktop, 'scripts/hidden-acceptance-contract.mjs'),
  join(desktop, 'scripts/hidden-acceptance-owner.mjs'),
  join(root, 'packages/phone/phone-runtime/tests/fixtures/fakemobilecli.mjs'),
  join(root, 'packages/phone/phone-runtime/tests/fixtures/u3-visible-frames.ts'),
  wdio, electron, process.execPath,
]
const verifyManifest = () => verifyAcceptanceManifest({
  manifest, root, head, requiredPaths: directInputs, operatedPlatformSource, operatedPlatformOutput,
  expectedEntries: {
    host: hostEntry, client: clientEntry, web: webEntry,
    desktop: join(desktop, 'out/main.mjs'), electron, wdio, node: process.execPath,
  },
})
verifyManifest()
verifyAcceptanceInventory(inventory)
rejectCredentialFallbacks([join(root, '.env'), join(desktop, '.env')])
if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) {
  throw new Error('source and acceptance inputs must be clean at the published SHA')
}
const scratch = mkdtempSync(join(tmpdir(), 'dsh-610-hidden-'))
chmodSync(scratch, 0o700)
const artifacts = join(root, '.artifacts', `610-hidden-${randomUUID()}`)
mkdirSync(artifacts, { recursive: true, mode: 0o700 })
const ports = []
async function freshPort() {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  if (ports.includes(port) || inventory.protectedPorts.includes(port)) return await freshPort()
  ports.push(port)
  return port
}
const fakePort = await freshPort()
const cdpPort = await freshPort()
const home = join(scratch, 'dsh-home')
const userData = join(scratch, 'user-data')
const workspace = join(scratch, 'workspace')
const fixtures = join(scratch, 'fixtures')
const privateTmp = join(scratch, 'tmp')
for (const path of [home, userData, workspace, fixtures, privateTmp]) mkdirSync(path, { mode: 0o700 })
rejectCredentialFallbacks([join(home, '.env'), join(home, '.credentials.yaml')])
const fake = join(fixtures, 'fakemobilecli')
const fixtureRoot = join(root, 'packages/phone/phone-runtime/tests/fixtures')
copyFileSync(join(fixtureRoot, 'fakemobilecli.mjs'), fake)
chmodSync(fake, 0o700)
copyFileSync(join(fixtureRoot, 'u3-visible-frames.ts'), join(fixtures, 'u3-visible-frames.ts'))
const ownerToken = randomUUID()
const devices = JSON.parse(readFileSync(join(desktop, 'tests/fixtures/phone-e2e-devices.json'), 'utf8')).filter(device => device.id === '00008120-REAL-E2E')
if (devices.length !== 1) throw new Error('expected exactly one real-classified iPhone fixture')
writeFileSync(join(fixtures, 'fakemobilecli.config.json'), JSON.stringify({ devices, ownerToken, agent: { installed: true }, listEnvelope: true, captureEnvelope: true, streamFrameCount: 10000, acceptanceHoldH264: true }))
writeFileSync(join(home, 'settings.yaml'), 'ui-phone:\n  enabled: true\nui-onboarding:\n  welcomeNoticeVersion: "2026-08-13.1"\n', { mode: 0o600 })
const smoke = join(artifacts, 'main-smoke.log')
writeFileSync(smoke, '')
const profile = join(scratch, 'profile.json')
writeFileSync(profile, JSON.stringify({ DSH_HOME: home, DSH_DESKTOP_SMOKE_FILE: smoke, windowPresentation: 'hidden' }), { mode: 0o600 })
const bin = join(scratch, 'bin')
mkdirSync(bin, { mode: 0o700 })
for (const tool of ['xcrun', 'xcodebuild', 'xcode-select', 'open', 'adb', 'emulator']) {
  writeFileSync(join(bin, tool), '#!/bin/sh\nexit 1\n', { mode: 0o700 })
}
const env = {
  HOME: scratch, DSH_HOME: home, DSH_NODE: process.execPath,
  TMPDIR: privateTmp,
  PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, CI: 'true', LANG: 'zh_CN.UTF-8', LANGUAGE: 'zh_CN',
  DSH_DESKTOP_E2E: '1', DSH_DESKTOP_E2E_PROFILE: profile, DSH_DESKTOP_SMOKE_FILE: smoke,
  DSH_PHONE_MOBILECLI: fake, DSH_PHONE_SERVER_PORT: String(fakePort),
  DSH_ELECTRON_E2E_ARTIFACT_DIR: artifacts, DSH_ELECTRON_E2E_CDP_PORT: String(cdpPort),
  DSH_ELECTRON_E2E_FAKE_PORT: String(fakePort), DSH_ELECTRON_E2E_FAKE_OWNER: ownerToken,
  DSH_ELECTRON_E2E_USER_DATA: userData, DSH_ELECTRON_E2E_WORKSPACE: workspace,
  DSH_HIDDEN_PHONE_ACCEPTANCE: '1',
}
writeFileSync(join(artifacts, 'inputs.json'), JSON.stringify({ publishedSha: head, manifest, inventory, scratch, ports, fake, profile }, null, 2))
let modelRequests = 0
const provider = createHttpServer((_request, response) => {
  modelRequests++
  response.writeHead(503).end('No model turn permitted in click-only acceptance')
})
await new Promise((resolve, reject) => { provider.once('error', reject); provider.listen(0, '127.0.0.1', resolve) })
env.DEEPSEEK_API_KEY = 'keyless-click-only'
env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${provider.address().port}`
let launchInventory
try {
  launchInventory = verifyAcceptanceInventory(inventory)
  verifyManifest()
} catch (error) {
  await closeProvider(provider)
  rmSync(scratch, { recursive: true })
  throw error
}
const owner = ownAcceptanceChild({
  command: process.execPath, args: [wdio, 'run', join(desktop, 'tests/e2e-electron/wdio.conf.ts'), '--spec', join(desktop, 'tests/e2e-electron/phone-playback-acceptance.e2e.ts')],
  cwd: desktop, env, scratch, recordFile: join(artifacts, 'ownership.json'), logFile: join(artifacts, 'runner.log'), runMs: 180_000, cleanupMs: 10_000,
  protectedPids: launchInventory.protectedPids,
  verifyCompletion: async () => {
    if (modelRequests !== 0) throw new Error(`click-only route made ${String(modelRequests)} model requests; scratch retained`)
    const smokeText = readFileSync(smoke, 'utf8')
    const { hostPort } = verifyShutdownEvidence(smokeText)
    verifyManifest()
    await waitForListenerClosure([...ports, hostPort], 10_000)
  },
})
const interrupted = signal => { void owner.cleanup().catch(error => { process.stderr.write(`${signal}: ${error.message}\n`) }) }
process.once('SIGINT', interrupted)
process.once('SIGTERM', interrupted)
let result
result = await owner.finished
const settled = await Promise.allSettled([closeProvider(provider), owner.cleanup()])
const failures = settled.flatMap(value => value.status === 'rejected' ? [String(value.reason)] : [])
let passed = failures.length === 0 && result?.code === 0 && result?.signal === null && modelRequests === 0
if (passed) {
  try { rmSync(scratch, { recursive: true }) } catch (error) { failures.push(String(error)); passed = false }
}
writeFileSync(join(artifacts, 'result.json'), JSON.stringify({ publishedSha: head, result, modelRequests, passed, failures }, null, 2))
if (!passed) {
  process.stderr.write(`acceptance cleanup failed; retain ${scratch}: ${failures.join('; ')}\n`)
  process.exitCode = 1
}
console.log(`Evidence: ${artifacts}`)

async function closeProvider(server) {
  server.closeAllConnections()
  await new Promise((resolveClose, rejectClose) => server.close(error => error === undefined ? resolveClose() : rejectClose(error)))
}

async function waitForListenerClosure(portsToCheck, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let surviving = []
  do {
    const listeners = listeningPorts()
    surviving = portsToCheck.filter(port => listeners.has(port))
    if (surviving.length === 0) return
    await delay(50)
  } while (Date.now() < deadline)
  throw new Error(`listeners survived graceful shutdown: ${surviving.join(', ')}; scratch retained`)
}

function listeningPorts() {
  const result = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8', timeout: 2_000 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0 && result.status !== 1) throw new Error(`lsof listener inventory failed with status ${String(result.status)}`)
  return new Set([...result.stdout.matchAll(/TCP\s+\S+:(\d+)\s+\(LISTEN\)$/gmu)].map(match => Number(match[1])))
}
