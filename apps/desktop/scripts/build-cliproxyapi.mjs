#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, '..')
const repository = join(desktop, '..', '..')
const source = join(repository, 'catalog', 'cliproxyapi')
const sourceSHA = '7fac6b15bcfe5ea55c18c9eaec8e5b7e6457d974'
const platform = flag('--platform') ?? process.platform
const arch = flag('--arch') ?? process.arch
const go = process.env.GO ?? '/opt/homebrew/bin/go'
const target = targetOf(platform, arch)
const outputDir = join(desktop, 'resources', 'cliproxyapi')
const binaryName = platform === 'win32' ? 'cliproxyapi.exe' : 'cliproxyapi'
const binary = join(outputDir, binaryName)

await mkdir(outputDir, { recursive: true })
await run('git', ['-C', source, 'cat-file', '-e', `${sourceSHA}^{commit}`])
const actualSHA = (await capture('git', ['-C', source, 'rev-parse', 'HEAD'])).trim()
if (actualSHA !== sourceSHA) throw new Error(`CLIProxyAPI submodule is ${actualSHA}, expected ${sourceSHA}`)
await run(go, ['build', '-trimpath', '-ldflags', '-s -w', '-o', binary, './cmd/server'], {
  cwd: source,
  env: { ...process.env, GOOS: target.goos, GOARCH: target.goarch, CGO_ENABLED: '0' },
})
if (platform !== 'win32') await chmod(binary, 0o755)
const sha256 = createHash('sha256').update(await readFile(binary)).digest('hex')
await writeFile(join(outputDir, 'manifest.json'), JSON.stringify({
  sourceSHA,
  platform,
  arch,
  path: binaryName,
  sha256,
}, undefined, 2) + '\n')

function flag(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

function targetOf(nodePlatform, nodeArch) {
  const goos = nodePlatform === 'darwin' ? 'darwin' : nodePlatform === 'win32' ? 'windows' : undefined
  const goarch = nodeArch === 'arm64' ? 'arm64' : nodeArch === 'x64' ? 'amd64' : undefined
  if (goos === undefined || goarch === undefined) throw new Error(`unsupported CLIProxyAPI target ${nodePlatform}/${nodeArch}`)
  return { goos, goarch }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`${command} exited code=${String(code)} signal=${String(signal)}`)))
  })
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] })
    let stdout = ''
    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${String(code)}`)))
  })
}
