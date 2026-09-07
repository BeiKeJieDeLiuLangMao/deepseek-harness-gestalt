import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  componentIdentity, rejectCredentialFallbacks, verifyAcceptanceInventory,
  verifyAcceptanceManifest, verifyShutdownEvidence,
} from '../../scripts/hidden-acceptance-contract.mjs'

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), '610-contract-')))
  const paths = Object.fromEntries([
    'host', 'client', 'web', 'desktop', 'electron', 'wdio', 'node', 'source', 'output', 'required',
  ].map(name => [name, join(root, name)]))
  for (const [name, path] of Object.entries(paths)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, name === 'source' || name === 'output' ? '{"environment":"production"}\n' : `${name}\n`)
  }
  const files = Object.entries(paths).map(([name, path]) => ({
    path: name,
    realpath: realpathSync(path),
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  }))
  const entries = new Map(files.map(file => [file.path, file]))
  const components = Object.fromEntries(['host', 'client', 'web', 'electron', 'wdio', 'node'].map(name => [name, {
    publishedSha: 'a'.repeat(40), entry: name, files: [name], identity: componentIdentity([name], entries),
  }]))
  const desktopFiles = ['desktop', 'source', 'output', 'required']
  components.desktop = {
    publishedSha: 'a'.repeat(40), entry: 'desktop', files: desktopFiles,
    identity: componentIdentity(desktopFiles, entries),
  }
  const manifest = {
    version: 1, reviewedInputGraph: true, publishedSha: 'a'.repeat(40), approvedRoots: [root], files, components,
    build: {
      builder: 'apps/desktop/scripts/build-main.mjs', operatedPlatformSource: 'source', operatedPlatformOutput: 'output',
    },
  }
  const options = {
    manifest, root, head: 'a'.repeat(40),
    expectedEntries: Object.fromEntries(['host', 'client', 'web', 'desktop', 'electron', 'wdio', 'node'].map(name => [name, paths[name]])),
    requiredPaths: [paths.required], operatedPlatformSource: paths.source, operatedPlatformOutput: paths.output,
  }
  return { root, paths, manifest, options }
}

test('manifest binds component identities and consumed realpaths', () => {
  const value = fixture()
  try {
    assert.equal(verifyAcceptanceManifest(value.options).fileCount, 10)
    value.manifest.components.host.identity = '0'.repeat(64)
    assert.throws(() => verifyAcceptanceManifest(value.options), /identity mismatch/)
  } finally { rmSync(value.root, { recursive: true }) }
})

test('manifest requires actual entry bindings for every component', () => {
  const value = fixture()
  try {
    delete value.options.expectedEntries.host
    assert.throws(() => verifyAcceptanceManifest(value.options), /host entry is not the consumed input/)
  } finally { rmSync(value.root, { recursive: true }) }
})

test('manifest rejects a symlink escape before accepting the declared graph', () => {
  const value = fixture()
  const outside = mkdtempSync(join(tmpdir(), '610-contract-outside-'))
  try {
    const target = join(outside, 'input')
    const link = join(value.root, 'escape')
    writeFileSync(target, 'outside\n')
    symlinkSync(target, link)
    value.manifest.files.push({
      path: 'escape', realpath: realpathSync(link),
      sha256: createHash('sha256').update(readFileSync(link)).digest('hex'),
    })
    assert.throws(() => verifyAcceptanceManifest(value.options), /outside approved roots/)
  } finally {
    rmSync(value.root, { recursive: true })
    rmSync(outside, { recursive: true })
  }
})

test('inventory is strictly fresh at spawn and validates exclusion ids', () => {
  const now = Date.parse('2026-09-07T07:00:00.000Z')
  const inventory = { approved: true, checkedAt: new Date(now - 59_999).toISOString(), protectedPids: [1], protectedPorts: [1234] }
  assert.deepEqual(verifyAcceptanceInventory(inventory, now).protectedPorts, [1234])
  assert.throws(() => verifyAcceptanceInventory({ ...inventory, checkedAt: new Date(now - 60_000).toISOString() }, now), /under 60 seconds/)
  assert.throws(() => verifyAcceptanceInventory({ ...inventory, protectedPids: [1, 1] }, now), /unique valid integers/)
})

test('shutdown evidence binds the ready Host exit and success receipt', () => {
  const text = 'host http://127.0.0.1:1234 pid 5678\nweb host exit pid=5678 code=null signal=SIGTERM requestedStop=stop\nshutdown complete\n'
  assert.deepEqual(verifyShutdownEvidence(text), { hostPid: 5678, hostPort: 1234 })
  assert.throws(() => verifyShutdownEvidence(text.replace('pid=5678', 'pid=9')), /ready Host exact exit/)
  assert.throws(() => verifyShutdownEvidence(text.replace('shutdown complete\n', '')), /success-only receipt/)
  assert.throws(() => verifyShutdownEvidence(`shutdown complete\n${text.replace('shutdown complete\n', '')}`), /after the ready Host exit/)
})

test('credential fallback check inspects existence without reading contents', () => {
  const root = mkdtempSync(join(tmpdir(), '610-credential-fallback-'))
  try {
    const dotenv = join(root, '.env')
    rejectCredentialFallbacks([dotenv])
    writeFileSync(dotenv, 'not-read')
    assert.throws(() => rejectCredentialFallbacks([dotenv]), /must be absent/)
  } finally { rmSync(root, { recursive: true }) }
})

test('runner refuses launch without a reviewed manifest and inventory', () => {
  const result = spawnSync(process.execPath, ['apps/desktop/scripts/run-hidden-phone-acceptance.mjs'], {
    cwd: process.cwd(), encoding: 'utf8', env: { PATH: '/usr/bin:/bin' },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /BUILD-MANIFEST\.json FRESH-INVENTORY\.json/)
})
