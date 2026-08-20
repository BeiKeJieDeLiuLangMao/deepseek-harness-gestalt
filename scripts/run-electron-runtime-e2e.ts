/**
 * Node wrapper for the declared Electron Browser Runtime e2e launch mode.
 *
 * Resolves the Electron binary from `@deepseek-ai/dsh-browser-runtime-electron`
 * and spawns `electron-runtime-e2e-main.mjs` as a real Electron application.
 * `ELECTRON_RUN_AS_NODE` is rejected so `process.versions.electron` and
 * `BrowserWindow` stay available to the in-process Provider.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const electronPackageJson = join(repoRoot, 'packages/browser/browser-runtime-electron/package.json')
const electronMain = join(here, 'electron-runtime-e2e-main.mjs')

const ELECTRON_MISSING = [
  'run-electron-runtime-e2e: the electron package did not resolve to a binary.',
  'Install workspace dependencies from the repo root and retry.',
].join(' ')

const ELECTRON_RUN_AS_NODE_SET = [
  'run-electron-runtime-e2e: ELECTRON_RUN_AS_NODE is set.',
  'Unset it so the child keeps process.versions.electron and BrowserWindow.',
].join(' ')

/**
 * Resolve the Electron executable from the Browser Runtime Electron package.
 * @param requireFromPackage - `require` bound to that package manifest.
 * @returns Absolute path to the Electron binary.
 */
export function resolveElectronBinary(
  requireFromPackage: NodeRequire = createRequire(electronPackageJson),
): string {
  let resolved: unknown
  try {
    resolved = requireFromPackage('electron')
  } catch {
    throw new Error(ELECTRON_MISSING)
  }
  if (typeof resolved !== 'string' || resolved.length === 0) {
    throw new Error(ELECTRON_MISSING)
  }
  return resolved
}

/**
 * Chromium switches that must precede the application entry.
 * @param platform - Host platform; `--no-sandbox` is omitted on darwin.
 * @returns argv after the Electron binary, ending with the declared main.
 */
export function electronRuntimeE2eMainArgs(platform: NodeJS.Platform = process.platform): string[] {
  return [
    ...platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
    ...platform === 'win32' ? ['--no-sandbox', '--disable-gpu'] : [],
    electronMain,
  ]
}

/**
 * Spawn Electron as an application and wait for the runtime e2e exit status.
 * @returns The Electron process exit code.
 */
export async function runElectronRuntimeE2e(): Promise<number> {
  const runAsNode = process.env.ELECTRON_RUN_AS_NODE
  if (runAsNode !== undefined && runAsNode !== '') {
    throw new Error(ELECTRON_RUN_AS_NODE_SET)
  }
  const electronBin = resolveElectronBinary()
  const env = {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
    DSH_ELECTRON_RUNTIME_E2E: '1',
  }
  Reflect.deleteProperty(env, 'ELECTRON_RUN_AS_NODE')
  return await new Promise<number>((resolveExit, reject) => {
    const child = spawn(electronBin, electronRuntimeE2eMainArgs(), {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal !== null) {
        reject(new Error(`run-electron-runtime-e2e: Electron exited from ${signal}`))
        return
      }
      resolveExit(code ?? 1)
    })
  })
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  void runElectronRuntimeE2e().then(
    (code) => {
      process.exit(code)
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    },
  )
}
