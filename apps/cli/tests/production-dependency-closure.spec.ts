import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  readonly dependencies?: Record<string, string>
  readonly name?: string
  readonly optionalDependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>
}

const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url))
const ignoredDirectories = new Set(['dist', 'lib', 'node_modules', 'out', 'release', 'resources'])

function collectManifests(directory: string, manifests: Map<string, PackageManifest>): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) collectManifests(join(directory, entry.name), manifests)
      continue
    }
    if (entry.name !== 'package.json') continue
    const manifest = JSON.parse(readFileSync(join(directory, entry.name), 'utf8')) as PackageManifest
    if (manifest.name !== undefined) manifests.set(manifest.name, manifest)
  }
}

function productionClosure(manifests: ReadonlyMap<string, PackageManifest>, root: string): Set<string> {
  const reachable = new Set<string>()
  const pending = [root]
  while (pending.length > 0) {
    const name = pending.shift()
    if (name === undefined || reachable.has(name)) continue
    const manifest = manifests.get(name)
    if (manifest === undefined) throw new Error(`workspace package not found: ${name}`)
    reachable.add(name)
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    }
    for (const dependency of Object.keys(dependencies)) {
      if (manifests.has(dependency)) pending.push(dependency)
    }
    for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[peer]?.optional === true || !range.startsWith('workspace:')) continue
      if (!manifests.has(peer)) throw new Error(`${name} requires missing workspace peer ${peer}`)
      pending.push(peer)
    }
  }
  return reachable
}

describe('CLI production dependency closure', () => {
  it('resolves every workspace peer required by its runtime dependencies', () => {
    const manifests = new Map<string, PackageManifest>()
    for (const directory of ['apps', 'packages', 'vendor']) {
      collectManifests(join(workspaceRoot, directory), manifests)
    }

    expect(productionClosure(manifests, '@deepseek-ai/dsh').size).toBeGreaterThan(100)
  })

  it('rejects a required workspace peer absent from the package inventory', () => {
    const manifests = new Map<string, PackageManifest>([
      ['@deepseek-ai/dsh', {
        name: '@deepseek-ai/dsh',
        dependencies: { '@deepseek-ai/dsh-plugin': 'workspace:^' },
      }],
      ['@deepseek-ai/dsh-plugin', {
        name: '@deepseek-ai/dsh-plugin',
        peerDependencies: { '@deepseek-ai/dsh-missing': 'workspace:^' },
      }],
    ])

    expect(() => productionClosure(manifests, '@deepseek-ai/dsh'))
      .toThrow('@deepseek-ai/dsh-plugin requires missing workspace peer @deepseek-ai/dsh-missing')
  })
})
