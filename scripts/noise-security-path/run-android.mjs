/** Build and execute the committed proof in a real Android Emulator WebView. */

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { closeSync, cpSync, mkdirSync, openSync as openFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const proofRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(proofRoot, '../..')
const androidRoot = join(proofRoot, 'runtimes/android/app/src/main')
const artifacts = join(repositoryRoot, '.artifacts/noise-security-path/android')
const sdkRoot = process.env.ANDROID_SDK_ROOT
  ?? process.env.ANDROID_HOME
  ?? '/opt/homebrew/share/android-commandlinetools'
const adb = join(sdkRoot, 'platform-tools/adb')
const emulator = join(sdkRoot, 'emulator/emulator')
const buildTools = join(sdkRoot, `build-tools/${process.env.DSH_NOISE_ANDROID_BUILD_TOOLS ?? '35.0.0'}`)
const androidJar = join(sdkRoot, `platforms/android-${process.env.DSH_NOISE_ANDROID_API ?? '34'}/android.jar`)
const bundleId = 'dev.deepseek.noiseproof'
const environment = {
  ...process.env,
  ANDROID_HOME: sdkRoot,
  ANDROID_SDK_ROOT: sdkRoot,
}

rmSync(artifacts, { force: true, recursive: true })
mkdirSync(artifacts, { recursive: true })
const classes = join(artifacts, 'classes')
const dex = join(artifacts, 'dex')
const staging = join(artifacts, 'staging')
mkdirSync(classes, { recursive: true })
mkdirSync(dex, { recursive: true })
mkdirSync(join(staging, 'assets'), { recursive: true })

execFileSync('javac', [
  '-source', '8',
  '-target', '8',
  '-Xlint:-options',
  '-classpath', androidJar,
  '-d', classes,
  join(androidRoot, 'java/dev/deepseek/noiseproof/MainActivity.java'),
], { stdio: 'inherit' })
const classArchive = join(artifacts, 'classes.jar')
execFileSync('jar', ['--create', '--file', classArchive, '-C', classes, '.'])
execFileSync(join(buildTools, 'd8'), [
  '--lib', androidJar,
  '--min-api', '26',
  '--output', dex,
  classArchive,
], { stdio: 'inherit' })

const unsignedApk = join(artifacts, 'unsigned.apk')
execFileSync(join(buildTools, 'aapt2'), [
  'link',
  '-o', unsignedApk,
  '-I', androidJar,
  '--manifest', join(androidRoot, 'AndroidManifest.xml'),
  '--min-sdk-version', '26',
  '--target-sdk-version', '34',
], { stdio: 'inherit' })
cpSync(join(dex, 'classes.dex'), join(staging, 'classes.dex'))
cpSync(join(proofRoot, 'web'), join(staging, 'assets/web'), { recursive: true })
cpSync(join(proofRoot, 'pkg'), join(staging, 'assets/pkg'), { recursive: true })
execFileSync('/usr/bin/zip', ['-q', '-r', unsignedApk, '.'], { cwd: staging })

const alignedApk = join(artifacts, 'aligned.apk')
execFileSync(join(buildTools, 'zipalign'), ['-f', '4', unsignedApk, alignedApk])
const keyStore = join(artifacts, 'debug.keystore')
execFileSync('keytool', [
  '-genkeypair',
  '-keystore', keyStore,
  '-storepass', 'android',
  '-alias', 'androiddebugkey',
  '-keypass', 'android',
  '-dname', 'CN=Android Debug,O=DeepSeek Harness,C=US',
  '-keyalg', 'RSA',
  '-validity', '10000',
], { stdio: 'ignore' })
const apk = join(artifacts, 'noise-proof.apk')
execFileSync(join(buildTools, 'apksigner'), [
  'sign',
  '--ks', keyStore,
  '--ks-pass', 'pass:android',
  '--key-pass', 'pass:android',
  '--out', apk,
  alignedApk,
])
execFileSync(join(buildTools, 'apksigner'), ['verify', apk])

let devices = execFileSync(adb, ['devices'], { encoding: 'utf8' })
let startedEmulator = false
if (!/^emulator-\d+\s+device$/m.test(devices)) {
  const log = openFileSync(join(artifacts, 'emulator.log'), 'a')
  const emulatorProcess = spawn(emulator, [
    `@${process.env.DSH_NOISE_ANDROID_AVD ?? 'GestaltTest'}`,
    '-no-window',
    '-no-audio',
    '-no-snapshot',
    '-gpu',
    'swiftshader_indirect',
  ], { detached: true, env: environment, stdio: ['ignore', log, log] })
  emulatorProcess.unref()
  closeSync(log)
  execFileSync(adb, ['wait-for-device'], { timeout: 60_000 })
  startedEmulator = true
}

const bootDeadline = Date.now() + 60_000
while (Date.now() < bootDeadline) {
  const completed = spawnSync(adb, ['shell', 'getprop', 'sys.boot_completed'], { encoding: 'utf8' })
  if (completed.stdout.trim() === '1') break
  await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
}
if (spawnSync(adb, ['shell', 'getprop', 'sys.boot_completed'], { encoding: 'utf8' }).stdout.trim() !== '1') {
  throw new Error('Android Emulator did not finish booting within 60 seconds')
}

spawnSync(adb, ['shell', 'am', 'force-stop', bundleId])
spawnSync(adb, ['uninstall', bundleId])
execFileSync(adb, ['install', apk], { stdio: 'inherit' })
execFileSync(adb, ['shell', 'am', 'start', '-n', `${bundleId}/.MainActivity`], { stdio: 'inherit' })

const reportDeadline = Date.now() + 10_000
let reportText
while (Date.now() < reportDeadline) {
  const result = spawnSync(adb, ['shell', 'run-as', bundleId, 'cat', 'files/noise-proof.json'], { encoding: 'utf8' })
  if (result.status === 0 && result.stdout.trim() !== '') {
    reportText = result.stdout.trim()
    break
  }
  await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
}
if (!reportText) {
  const progress = spawnSync(adb, [
    'shell', 'run-as', bundleId, 'cat', 'files/noise-proof-progress.txt',
  ], { encoding: 'utf8' }).stdout.trim()
  spawnSync(adb, ['shell', 'am', 'force-stop', bundleId])
  spawnSync(adb, ['uninstall', bundleId])
  if (startedEmulator) spawnSync(adb, ['emu', 'kill'])
  throw new Error(`Android WebView did not produce a proof report within 10 seconds; ${progress || 'no progress reported'}`)
}
const androidApi = execFileSync(adb, ['shell', 'getprop', 'ro.build.version.sdk'], { encoding: 'utf8' }).trim()
const webViewPackage = execFileSync(adb, ['shell', 'dumpsys', 'package', 'com.android.webview'], { encoding: 'utf8' })
const webViewVersion = webViewPackage.match(/versionName=([^\s]+)/)?.[1] ?? 'unknown'
spawnSync(adb, ['shell', 'am', 'force-stop', bundleId])
spawnSync(adb, ['uninstall', bundleId])
if (startedEmulator) spawnSync(adb, ['emu', 'kill'])
if (reportText.startsWith('ERROR:')) throw new Error(reportText)
const report = JSON.parse(reportText)
if (report.runtime !== 'Android WebView') throw new Error('Android proof returned the wrong runtime label')
if (report.allPass !== true) throw new Error('Android WebView returned a failing proof report')
process.stderr.write(`Android API ${androidApi}, WebView ${webViewVersion}: pass\n`)
process.stdout.write(`${reportText}\n`)
