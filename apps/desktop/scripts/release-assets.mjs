#!/usr/bin/env node
/** Select the exact public files from downloaded Desktop packaging artifacts. */
import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

const RELEASE_EXTENSIONS = new Set(['.blockmap', '.dmg', '.exe', '.zip', '.yml', '.yaml'])

/**
 * Collect publishable Desktop Bundle assets and require the merged macOS feed.
 * @param {string} root - downloaded artifact root.
 * @param {string} version - Desktop Bundle version.
 * @returns {Promise<string[]>} sorted asset paths.
 */
export async function releaseAssetPaths(root, version) {
  const assets = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isFile() && isReleaseAsset(entry.name)) assets.push(path)
    if (entry.isDirectory()) {
      for (const artifact of await readdir(path, { withFileTypes: true })) {
        if (artifact.isFile() && isReleaseAsset(artifact.name)) {
          assets.push(join(path, artifact.name))
        }
      }
    }
  }
  const expected = [
    `DeepSeek-Gestalt-${version}-arm64.dmg`,
    `DeepSeek-Gestalt-${version}-arm64.dmg.blockmap`,
    `DeepSeek-Gestalt-${version}-arm64.zip`,
    `DeepSeek-Gestalt-${version}-arm64.zip.blockmap`,
    `DeepSeek-Gestalt-${version}-x64.dmg`,
    `DeepSeek-Gestalt-${version}-x64.dmg.blockmap`,
    `DeepSeek-Gestalt-${version}-x64.zip`,
    `DeepSeek-Gestalt-${version}-x64.zip.blockmap`,
    `DeepSeekGestalt-Setup-${version}-x64.exe`,
    `DeepSeekGestalt-Setup-${version}-x64.exe.blockmap`,
    'latest-mac.yml',
    'latest.yml',
  ]
  const names = assets.map(path => basename(path)).sort()
  const expectedNames = [...expected].sort()
  const expectedSet = new Set(expectedNames)
  const unexpected = names.filter(name => !expectedSet.has(name))
  if (unexpected.length > 0) {
    throw new Error(`release assets include unexpected publishable files: ${unexpected.join(', ')}`)
  }
  const duplicate = names.filter((name, index) => names.indexOf(name) !== index)
  if (duplicate.length > 0) throw new Error(`release assets include duplicate files: ${duplicate.join(', ')}`)
  const namesSet = new Set(names)
  const missing = expectedNames.filter(name => !namesSet.has(name))
  if (missing.length > 0) throw new Error(`release assets are missing: ${missing.join(', ')}`)

  for (const feed of ['latest-mac.yml', 'latest.yml']) {
    const path = assets.find(candidate => basename(candidate) === feed)
    if (path === undefined) throw new Error(`release assets are missing: ${feed}`)
    const declared = /^version:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(await readFile(path, 'utf8'))?.[1]
    if (declared !== version) {
      throw new Error(`${feed} version ${declared ?? '<missing>'} does not match ${version}`)
    }
  }
  return assets.sort()
}

/** @param {string} name @returns {boolean} */
function isReleaseAsset(name) {
  if (name.startsWith('builder-')) return false
  const dot = name.lastIndexOf('.')
  return dot >= 0 && RELEASE_EXTENSIONS.has(name.slice(dot))
}

if (process.argv[1]?.endsWith('release-assets.mjs') === true) {
  const root = process.argv[2]
  const version = process.argv[3]
  if (root === undefined || root.length === 0 || version === undefined || version.length === 0) {
    throw new Error('usage: release-assets.mjs <artifact-root> <version>')
  }
  for (const path of await releaseAssetPaths(root, version)) console.log(path)
}
