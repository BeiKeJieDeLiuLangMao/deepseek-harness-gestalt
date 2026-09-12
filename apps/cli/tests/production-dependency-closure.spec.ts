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

describe('CLI production dependency closure', () => {
  it('provides every workspace peer required by its runtime dependencies', () => {
    const manifests = new Map<string, PackageManifest>()
    for (const directory of ['apps', 'packages', 'vendor']) {
      collectManifests(join(workspaceRoot, directory), manifests)
    }
    const reachable = new Set<string>()
    const pending = ['@deepseek-ai/dsh']
    while (pending.length > 0) {
      const name = pending.shift()
      if (name === undefined || reachable.has(name)) continue
      reachable.add(name)
      const manifest = manifests.get(name)
      if (manifest === undefined) throw new Error(`workspace package not found: ${name}`)
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
      }
      for (const dependency of Object.keys(dependencies)) {
        if (manifests.has(dependency)) pending.push(dependency)
      }
    }
    const missing: string[] = []
    for (const name of reachable) {
      const manifest = manifests.get(name)
      if (manifest === undefined) continue
      for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
        if (manifest.peerDependenciesMeta?.[peer]?.optional === true) continue
        if (range.startsWith('workspace:') && manifests.has(peer) && !reachable.has(peer)) {
          missing.push(`${name} -> ${peer}`)
        }
      }
    }
    expect(missing.sort()).toEqual([])
  })
})
