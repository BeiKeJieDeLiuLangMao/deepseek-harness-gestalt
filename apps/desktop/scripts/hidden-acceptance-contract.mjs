/** Input and completion checks for the bounded hidden Desktop acceptance lane. */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, basename, parse, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const SHA256 = /^[a-f0-9]{64}$/u
const PUBLISHED_SHA = /^[a-f0-9]{40}$/u
const COMPONENTS = ['host', 'client', 'web', 'desktop', 'electron', 'wdio', 'node']

/**
 * Compute the identity for one explicitly reviewed component file list.
 * @param {readonly string[]} files Manifest file keys owned by the component.
 * @param {ReadonlyMap<string, { sha256: string }>} entries Verified manifest entries.
 * @returns {string} SHA-256 over sorted file keys and content hashes.
 */
export function componentIdentity(files, entries) {
  const lines = [...files].sort().map(path => `${path}\0${entries.get(path)?.sha256 ?? ''}`)
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}

/**
 * Verify one root-reviewed graph against the files and executables the lane will consume.
 * @param {{ manifest: unknown, root: string, head: string, expectedEntries: Readonly<Record<string, string>>, requiredPaths: readonly string[], operatedPlatformSource: string, operatedPlatformOutput: string }} options Reviewed graph and actual inputs.
 * @returns {{ readonly fileCount: number, readonly approvedRoots: readonly string[] }} Verified graph facts.
 */
export function verifyAcceptanceManifest(options) {
  const manifest = objectRecord(options.manifest, 'build manifest')
  if (manifest.version !== 1 || manifest.reviewedInputGraph !== true) {
    throw new Error('build manifest requires version 1 and a root-reviewed complete input graph')
  }
  if (manifest.publishedSha !== options.head || !PUBLISHED_SHA.test(options.head)) {
    throw new Error('build manifest must attribute artifacts to this published SHA')
  }
  const approvedRoots = stringArray(manifest.approvedRoots, 'build manifest approvedRoots').map(path => {
    if (!isAbsolute(path)) throw new Error('build manifest approved roots must be absolute')
    const absolute = resolve(path)
    const canonical = realpathSync(absolute)
    if (canonical !== absolute || canonical === parse(canonical).root) {
      throw new Error(`build manifest approved root is not a canonical bounded directory: ${path}`)
    }
    return canonical
  })
  const canonicalRoot = realpathSync(options.root)
  if (!approvedRoots.includes(canonicalRoot)) throw new Error('build manifest must approve the exact runner checkout root')

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('build manifest requires artifact hashes')
  }
  const entries = new Map()
  const realpaths = new Set()
  for (const value of manifest.files) {
    const entry = objectRecord(value, 'build manifest file')
    if (typeof entry.path !== 'string' || entry.path.length === 0 || entry.path.includes('\0')) {
      throw new Error('build manifest file paths must be non-empty strings')
    }
    if (!isAbsolute(entry.path) && entry.path.split(/[\\/]/u).includes('..')) {
      throw new Error(`build manifest file path escapes its checkout: ${entry.path}`)
    }
    if (typeof entry.realpath !== 'string' || !isAbsolute(entry.realpath)) {
      throw new Error(`build manifest file requires an absolute realpath: ${entry.path}`)
    }
    if (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) {
      throw new Error(`build manifest file requires a SHA-256: ${entry.path}`)
    }
    if (entries.has(entry.path)) throw new Error(`build manifest repeats file path: ${entry.path}`)
    const target = isAbsolute(entry.path) ? resolve(entry.path) : resolve(canonicalRoot, entry.path)
    const canonical = realpathSync(target)
    if (entry.realpath !== canonical) throw new Error(`build manifest realpath changed: ${entry.path}`)
    if (!approvedRoots.some(root => contains(root, canonical))) {
      throw new Error(`build manifest file is outside approved roots: ${entry.path}`)
    }
    if (!statSync(canonical).isFile()) throw new Error(`build manifest input is not a file: ${entry.path}`)
    if (basename(canonical) === '.env' || basename(canonical) === '.credentials.yaml') {
      throw new Error(`build manifest cannot include credential input: ${entry.path}`)
    }
    if (realpaths.has(canonical)) throw new Error(`build manifest repeats resolved file: ${entry.path}`)
    realpaths.add(canonical)
    const actual = createHash('sha256').update(readFileSync(canonical)).digest('hex')
    if (actual !== entry.sha256) throw new Error(`artifact mismatch: ${entry.path}`)
    entries.set(entry.path, { path: entry.path, realpath: canonical, sha256: entry.sha256 })
  }

  const components = objectRecord(manifest.components, 'build manifest components')
  const assigned = new Set()
  for (const name of COMPONENTS) {
    const component = objectRecord(components[name], `build manifest ${name} component`)
    if (component.publishedSha !== options.head) throw new Error(`build manifest ${name} component has the wrong SHA`)
    const files = stringArray(component.files, `build manifest ${name} component files`)
    if (files.length === 0 || new Set(files).size !== files.length) {
      throw new Error(`build manifest ${name} component requires unique files`)
    }
    if (typeof component.entry !== 'string' || !files.includes(component.entry)) {
      throw new Error(`build manifest ${name} entry must belong to that component`)
    }
    for (const path of files) {
      if (!entries.has(path)) throw new Error(`build manifest ${name} component names an unknown file: ${path}`)
      assigned.add(path)
    }
    const identity = componentIdentity(files, entries)
    if (component.identity !== identity) throw new Error(`build manifest ${name} component identity mismatch`)
    const expected = options.expectedEntries[name]
    if (typeof expected !== 'string' || entries.get(component.entry)?.realpath !== realpathSync(expected)) {
      throw new Error(`build manifest ${name} entry is not the consumed input`)
    }
  }
  if (assigned.size !== entries.size) throw new Error('build manifest contains files outside its component graph')

  for (const path of options.requiredPaths) {
    const canonical = realpathSync(path)
    if (!realpaths.has(canonical)) throw new Error(`build manifest omitted consumed input: ${path}`)
  }
  const build = objectRecord(manifest.build, 'build manifest build receipt')
  const source = realpathSync(options.operatedPlatformSource)
  const output = realpathSync(options.operatedPlatformOutput)
  if (build.builder !== 'apps/desktop/scripts/build-main.mjs'
    || build.operatedPlatformSource !== manifestPathFor(canonicalRoot, source)
    || build.operatedPlatformOutput !== manifestPathFor(canonicalRoot, output)) {
    throw new Error('build manifest does not bind the operated Platform build input and output')
  }
  const sourceConfig = JSON.parse(readFileSync(source, 'utf8'))
  const outputConfig = JSON.parse(readFileSync(output, 'utf8'))
  if (!isDeepStrictEqual(sourceConfig, outputConfig)) {
    throw new Error('built operated Platform config differs from the reviewed fixture')
  }
  return { fileCount: entries.size, approvedRoots }
}

/**
 * Require a fresh root-reviewed exclusion inventory immediately before spawn.
 * @param {unknown} value Parsed inventory document.
 * @param {number} [now] Current epoch milliseconds.
 * @returns {{ readonly checkedAt: string, readonly protectedPids: readonly number[], readonly protectedPorts: readonly number[] }} Validated inventory.
 */
export function verifyAcceptanceInventory(value, now = Date.now()) {
  const inventory = objectRecord(value, 'ownership inventory')
  const checked = typeof inventory.checkedAt === 'string' ? Date.parse(inventory.checkedAt) : Number.NaN
  if (inventory.approved !== true || !Number.isFinite(checked) || now - checked < 0 || now - checked >= 60_000) {
    throw new Error('fresh root-approved ownership inventory (under 60 seconds at spawn) required')
  }
  const protectedPids = integers(inventory.protectedPids, 'protected PID', value => value > 0)
  const protectedPorts = integers(inventory.protectedPorts, 'protected port', value => value > 0 && value <= 65_535)
  return { checkedAt: inventory.checkedAt, protectedPids, protectedPorts }
}

/**
 * Refuse local credential fallbacks by metadata without reading their contents.
 * @param {readonly string[]} paths Exact fallback paths used by the launched composition.
 * @returns {void}
 */
export function rejectCredentialFallbacks(paths) {
  for (const path of paths) {
    if (existsSync(path) || linkExists(path)) throw new Error(`credential fallback must be absent: ${path}`)
  }
}

/**
 * End a detached hidden-lane WebDriver session before requesting normal product shutdown.
 * The Electron service's main-process CDP bridge remains independent of the deleted
 * WebDriver session. Clearing `sessionId` prevents WDIO Runner from deleting the same
 * session again after Electron exits. Both teardown failures remain observable.
 * @param {{ sessionId?: string, deleteSession(): Promise<unknown>, electron: { execute(script: (electron: { app: { quit(): void } }) => void): Promise<unknown> } }} browser WDIO Electron browser.
 * @returns {Promise<void>} Completion after both teardown requests settle.
 */
export async function shutdownDetachedWdioSession(browser) {
  let deleteFailure
  try {
    await browser.deleteSession()
  } catch (error) {
    deleteFailure = error
  } finally {
    browser.sessionId = undefined
  }

  let quitFailure
  try {
    await browser.electron.execute((electron) => { electron.app.quit() })
  } catch (error) {
    quitFailure = error
  }

  if (deleteFailure !== undefined && quitFailure !== undefined) {
    throw new AggregateError([deleteFailure, quitFailure], 'WebDriver deletion and Desktop shutdown both failed')
  }
  if (deleteFailure !== undefined) throw deleteFailure
  if (quitFailure !== undefined) throw quitFailure
}

/**
 * Require one ready Host, its exact requested-stop exit, and the success-only shutdown receipt.
 * @param {string} text Desktop smoke file contents after launcher exit.
 * @returns {{ readonly hostPid: number, readonly hostPort: number }} Host identity and listener.
 */
export function verifyShutdownEvidence(text) {
  const hosts = [...text.matchAll(/^host http:\/\/127\.0\.0\.1:(\d+) pid (\d+)$/gmu)]
  if (hosts.length !== 1) throw new Error('shutdown evidence requires exactly one ready Web Host')
  const exits = [...text.matchAll(/^web host exit pid=(\d+) code=0 signal=null requestedStop=abort$/gmu)]
  const hostPid = Number(hosts[0][2])
  const hostPort = Number(hosts[0][1])
  if (!Number.isSafeInteger(hostPid) || !Number.isSafeInteger(hostPort)) throw new Error('shutdown evidence contains an invalid Host identity')
  if (exits.length !== 1 || Number(exits[0][1]) !== hostPid) {
    throw new Error('shutdown evidence requires the ready Host exact normal-quit exit')
  }
  const receipts = [...text.matchAll(/^shutdown complete$/gmu)]
  if (receipts.length !== 1) {
    throw new Error('shutdown evidence requires exactly one success-only receipt')
  }
  if (receipts[0].index <= exits[0].index) {
    throw new Error('shutdown evidence requires the success-only receipt after the ready Host exit')
  }
  if (/^error /mu.test(text)) throw new Error('Desktop smoke log contains an error')
  return { hostPid, hostPort }
}

function objectRecord(value, name) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${name} must be an object`)
  return value
}

function stringArray(value, name) {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new TypeError(`${name} must be a string array`)
  return value
}

function integers(value, name, predicate) {
  if (!Array.isArray(value) || !value.every(item => Number.isSafeInteger(item) && predicate(item)) || new Set(value).size !== value.length) {
    throw new TypeError(`ownership inventory ${name}s must be unique valid integers`)
  }
  return [...value]
}

function contains(root, target) {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function manifestPathFor(root, target) {
  return contains(root, target) ? relative(root, target) : target
}

function linkExists(path) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}
