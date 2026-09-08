/** Verify compiled package entry points through staged self-references under plain Node. */

import {
  copyFileSync,
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const repositoryRoot = resolve(import.meta.dirname, '..')
const { values: options } = parseArgs({
  args: process.argv.slice(2),
  options: { 'packages-root': { type: 'string' }, 'loader-url': { type: 'string' } },
})
const packagesRoot = resolve(options['packages-root'] ?? repositoryRoot)
const loaderUrl = options['loader-url']
  ?? pathToFileURL(resolve(repositoryRoot, 'vendor/loader/lib/index.js')).href
const failures = []
const CLIENT_RUNTIME = '@deepseek-ai/dsh-client-runtime'
const manifests = globSync('packages/*/*/package.json', { cwd: packagesRoot }).sort()
const { default: Loader } = await import(loaderUrl)
const loader = Object.create(Loader.prototype)

for (const manifestPath of manifests) {
  const packageDir = dirname(resolve(packagesRoot, manifestPath))
  const manifest = JSON.parse(readFileSync(resolve(packagesRoot, manifestPath), 'utf8'))
  const packageName = manifest.name
  if (typeof packageName !== 'string' || packageName.length === 0) {
    failures.push(`${manifestPath}: missing package name`)
    continue
  }
  const invariantExport = manifest.exports?.['./invariant']
  if (typeof invariantExport !== 'object'
    || invariantExport.default !== './lib/invariant.js'
    || !manifest.files?.includes('lib/invariant.js')) {
    failures.push(`${packageName}: manifest does not publish ./lib/invariant.js as ./invariant`)
    continue
  }

  // Keep the staged view below its owning package so Node reaches the real
  // pnpm dependency links. Junctioning node_modules elsewhere breaks pnpm's
  // relative workspace links on Windows. Copy the manifest-declared lib view
  // so a companion that imports an undeclared runtime chunk fails here.
  const stagedPackageDir = mkdtempSync(resolve(packageDir, '.dsh-built-invariant-'))
  try {
    copyFileSync(resolve(packageDir, 'package.json'), resolve(stagedPackageDir, 'package.json'))
    copyDeclaredLibFiles(packageDir, stagedPackageDir, manifest.files)
    const probePath = resolve(stagedPackageDir, 'probe.mjs')
    writeFileSync(
      probePath,
      `import * as companion from ${JSON.stringify(`${packageName}/invariant`)}\nexport default companion\n`,
    )
    const { default: companion } = await import(pathToFileURL(probePath).href)
    if ('default' in companion) throw new Error('companion has a default export')
    const unwrapped = loader.unwrapExports(companion)
    if (unwrapped !== companion) throw new Error('Loader collapsed the companion namespace')
    if (typeof unwrapped.name !== 'string') throw new Error('companion name is missing')
    if (!Array.isArray(unwrapped.inject) || !unwrapped.inject.includes('invariants')) {
      throw new Error('companion does not inject invariants')
    }
    if (typeof unwrapped.apply !== 'function') throw new Error('companion apply is missing')
    if (packageName === CLIENT_RUNTIME) await verifyClientRuntimeEntry(manifest, packageName, stagedPackageDir)
  } catch (error) {
    failures.push(`${packageName}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    rmSync(stagedPackageDir, { recursive: true, force: true })
  }
}

async function verifyClientRuntimeEntry(manifest, packageName, stagedPackageDir) {
  const clientExport = manifest.exports?.['./client']
  if (typeof clientExport !== 'object' || clientExport === null) {
    throw new Error('exports["./client"] must be an object')
  }
  if (clientExport.node !== './lib/client-node.js') {
    throw new Error(`exports["./client"].node must be ./lib/client-node.js; found ${JSON.stringify(clientExport.node)}`)
  }
  if (clientExport.default !== './lib/client.cjs') {
    throw new Error(`exports["./client"].default must remain ./lib/client.cjs; found ${JSON.stringify(clientExport.default)}`)
  }
  for (const artifact of ['lib/client-node.js', 'lib/client.cjs']) {
    if (!manifest.files?.includes(artifact)) throw new Error(`files must publish ${artifact}`)
  }

  const expected = pathToFileURL(realpathSync(resolve(stagedPackageDir, 'lib/client-node.js'))).href
  const probePath = resolve(stagedPackageDir, 'client-probe.mjs')
  writeFileSync(probePath, [
    `const expected = ${JSON.stringify(expected)}`,
    `const resolved = import.meta.resolve(${JSON.stringify(`${packageName}/client`)})`,
    "if (resolved !== expected) throw new Error(`plain Node resolved ${resolved}; expected ${expected}`)",
    `const client = await import(${JSON.stringify(`${packageName}/client`)})`,
    "if (typeof client.createSnapshotStore !== 'function') throw new Error('client runtime public carrier is missing')",
    '',
  ].join('\n'))
  await import(pathToFileURL(probePath).href)
}

if (failures.length > 0) {
  console.error('verify-built-package-invariants: compiled companion failures:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`verify-built-package-invariants: ${manifests.length} compiled companion(s) passed plain-Node Loader checks.`)

function copyDeclaredLibFiles(packageDir, stagedPackageDir, files) {
  for (const pattern of files) {
    if (!pattern.startsWith('lib/')) continue
    for (const relativePath of globSync(pattern, { cwd: packageDir })) {
      const source = resolve(packageDir, relativePath)
      if (!existsSync(source)) continue
      const target = resolve(stagedPackageDir, relativePath)
      mkdirSync(dirname(target), { recursive: true })
      cpSync(source, target, { recursive: true })
    }
  }
}
