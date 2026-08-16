#!/usr/bin/env node
/** Select release assets without relying on shell glob expansion. */
import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

const RELEASE_EXTENSIONS = new Set(['.dmg', '.exe', '.zip', '.yml', '.yaml'])

/**
 * Collect publishable Desktop Bundle assets and require the merged macOS feed.
 * @param {string} root - downloaded artifact root.
 * @param {string} version - Desktop Bundle version.
 * @returns {Promise<string[]>} sorted asset paths.
 */
export async function releaseAssetPaths(root, version) {
  const assets = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (isReleaseAsset(entry.name)) assets.push(path)
    }
  }
  await walk(root)
  const names = new Set(assets.map(path => basename(path)))
  const expected = [
    `DeepSeek-Gestalt-${version}-arm64.dmg`,
    `DeepSeek-Gestalt-${version}-arm64.zip`,
    `DeepSeek-Gestalt-${version}-x64.dmg`,
    `DeepSeek-Gestalt-${version}-x64.zip`,
    `DeepSeekGestalt-Setup-${version}-x64.exe`,
    'latest-mac.yml',
    'latest.yml',
  ]
  const missing = expected.filter(name => !names.has(name))
  if (missing.length > 0) throw new Error(`release assets are missing: ${missing.join(', ')}`)
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
