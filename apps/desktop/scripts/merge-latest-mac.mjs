#!/usr/bin/env node
/**
 * Merge per-arch latest-mac.yml files from matrix pack jobs into one feed
 * listing every mac zip so electron-updater can match process.arch.
 */
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function mergeLatestMacFeeds(root) {
  const found = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name === 'latest-mac.yml' || entry.name === 'latest-mac.yaml') found.push(path)
    }
  }
  await walk(root)
  if (found.length === 0) throw new Error('no latest-mac.yml under ' + root)

  const files = []
  let version
  let releaseDate
  for (const file of found) {
    const parsed = parseLatestMac(await readFile(file, 'utf8'))
    if (version === undefined) version = parsed.version
    else if (parsed.version !== version) {
      throw new Error('mixed versions in latest-mac.yml: ' + version + ' vs ' + parsed.version)
    }
    if (parsed.releaseDate !== undefined) releaseDate = parsed.releaseDate
    files.push(...parsed.files)
  }
  if (version === undefined) throw new Error('no version in latest-mac.yml')
  if (files.length === 0) throw new Error('no files listed in latest-mac.yml')

  const merged = [
    'version: ' + version,
    'files:',
    ...files.flatMap((item) => [
      '  - url: ' + item.url,
      '    sha512: ' + item.sha512,
      '    size: ' + item.size,
    ]),
    'path: ' + files[0].url,
    'sha512: ' + files[0].sha512,
    ...(releaseDate === undefined ? [] : ['releaseDate: ' + releaseDate]),
    '',
  ].join('\n')

  const out = join(root, 'latest-mac.yml')
  await writeFile(out, merged)
  for (const file of found) {
    if (file !== out) await unlink(file)
  }
  return { out, feeds: found.length, files: files.length }
}

const invoked = process.argv[1] !== undefined && process.argv[1].endsWith('merge-latest-mac.mjs')
if (invoked) {
  const root = process.argv[2]
  if (root === undefined || root.length === 0) {
    throw new Error('usage: merge-latest-mac.mjs <artifact-root>')
  }
  const result = await mergeLatestMacFeeds(root)
  console.log('merged ' + String(result.feeds) + ' feeds / ' + String(result.files) + ' files -> ' + result.out)
}

/**
 * @param {string} text
 * @returns {{ version: string, releaseDate?: string, files: { url: string, sha512: string, size: string }[] }}
 */
export function parseLatestMac(text) {
  const version = field(text, 'version')
  if (version === undefined) throw new Error('latest-mac.yml missing version')
  const releaseDate = field(text, 'releaseDate')
  const listed = [...text.matchAll(/^\s+- url:\s*(.+)$/gm)].map((match) => match[1].trim())
  const files = []
  if (listed.length > 0) {
    const shaAll = [...text.matchAll(/^\s+sha512:\s*(.+)$/gm)].map((match) => match[1].trim())
    const sizeAll = [...text.matchAll(/^\s+size:\s*(.+)$/gm)].map((match) => match[1].trim())
    listed.forEach((url, index) => {
      const sha512 = shaAll[index]
      const size = sizeAll[index]
      if (sha512 === undefined || size === undefined) throw new Error('incomplete files entry for ' + url)
      files.push({ url, sha512, size })
    })
  } else {
    const url = field(text, 'path')
    const sha512 = field(text, 'sha512')
    const size = field(text, 'size')
    if (url === undefined || sha512 === undefined || size === undefined) {
      throw new Error('latest-mac.yml missing path/sha512/size')
    }
    files.push({ url, sha512, size })
  }
  return { version, ...(releaseDate === undefined ? {} : { releaseDate }), files }
}

function field(text, name) {
  return new RegExp('^' + name + ':\\s*(.+)$', 'm').exec(text)?.[1]?.trim()
}
