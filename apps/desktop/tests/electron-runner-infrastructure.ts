/** Shared process, TLS, and loopback infrastructure for source Electron acceptance lanes. */

import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer, request as httpRequest } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  createProcessInspector,
  type ProcessIdentity,
  type ProcessInspector,
} from '@deepseek-ai/dsh-subprocess-local/src/process-inspector.ts'

const execute = promisify(execFile)

/**
 * Create a one-day local CA certificate for the acceptance origin.
 * @param root - Private runtime directory receiving certificate material.
 * @param host - Non-loopback IPv4 address named by the certificate.
 * @returns Certificate file paths and their host.
 */
export async function createCertificate(
  root: string,
  host: string,
): Promise<{ host: string; key: string; cert: string }> {
  const key = join(root, 'platform-key.pem')
  const cert = join(root, 'platform-cert.pem')
  const config = join(root, 'openssl.cnf')
  await writeFile(config, [
    '[req]',
    'distinguished_name = dn',
    'x509_extensions = v3_req',
    'prompt = no',
    '[dn]',
    'CN = Project Members Electron',
    '[v3_req]',
    `subjectAltName = IP:${host}`,
    'basicConstraints = critical,CA:TRUE',
    'keyUsage = critical,digitalSignature,keyEncipherment,keyCertSign',
    '',
  ].join('\n'))
  await execute('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-config', config, '-keyout', key, '-out', cert,
  ])
  return { host, key, cert }
}

/**
 * Start an HTTPS reverse proxy to one loopback HTTP listener.
 * @param host - Listener host.
 * @param port - Listener port.
 * @param keyPath - TLS private-key path.
 * @param certPath - TLS certificate path.
 * @param targetOrigin - Loopback HTTP origin receiving proxied requests.
 * @returns Quiescent proxy disposer.
 */
export async function startHttpsProxy(
  host: string,
  port: number,
  keyPath: string,
  certPath: string,
  targetOrigin: string,
): Promise<{ close(): Promise<void> }> {
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)])
  const target = new URL(targetOrigin)
  const server = createHttpsServer({ key, cert }, (request, response) => {
    const upstream = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: target.host },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    })
    upstream.on('error', (error) => { response.destroy(error) })
    request.pipe(upstream)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => { server.off('error', reject); resolve() })
  })
  return {
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    },
  }
}

/** @returns An unoccupied TCP port released before the caller binds it. */
export async function reservePort(): Promise<number> {
  const server = createHttpServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '0.0.0.0', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('port reservation exposed no address')
  await new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })
  return address.port
}

/** @returns The first non-loopback IPv4 address on this host. */
export function localIpv4(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  throw new Error('Electron acceptance requires a non-loopback local IPv4 address')
}

/**
 * Run one child and retain its combined output in an artifact.
 * @param command - Executable path or command name.
 * @param args - Child arguments.
 * @param options - Working directory, clean environment, and output artifact.
 * @returns Child exit status.
 */
export async function runLogged(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly logFile: string },
): Promise<number> {
  await mkdir(dirname(options.logFile), { recursive: true })
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    const retain = (chunk: Buffer): void => {
      chunks.push(chunk)
      process.stdout.write(chunk)
    }
    child.stdout.on('data', retain)
    child.stderr.on('data', retain)
    child.once('error', reject)
    child.once('close', (code) => {
      void writeFile(options.logFile, Buffer.concat(chunks)).then(() => { resolve(code ?? 1) }, reject)
    })
  })
}

/**
 * Remove ambient credential-like variables before launching build and test children.
 * @param source - Parent environment.
 * @returns Environment without credential-like names.
 */
export function cleanEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(name)))
}

/**
 * Capture exact identities for owned roots and every currently live descendant.
 * @param rootPids - Process roots proven to belong to this acceptance run.
 * @param inspector - Platform process-table inspector.
 * @returns Children-first identities, de-duplicated across nested roots.
 */
export function captureOwnedProcessTree(
  rootPids: readonly number[],
  inspector: ProcessInspector = createProcessInspector(),
): ProcessIdentity[] {
  const snapshot = inspector.snapshot()
  const identities: ProcessIdentity[] = []
  for (const rootPid of [...new Set(rootPids)]) {
    const tree = snapshot.tree(rootPid)
    if (!tree.some(identity => identity.pid === rootPid)) {
      throw new Error(`Electron acceptance could not establish process identity for owned root ${String(rootPid)}`)
    }
    for (const identity of tree) mergeProcessIdentity(identities, identity)
  }
  return identities
}

/**
 * Wait for exact owned process identities to stop, treating PID reuse as exit.
 * @param identities - PID and start identities captured by this acceptance run.
 * @param inspector - Platform process-table inspector.
 */
export async function assertOwnedProcessesExited(
  identities: readonly ProcessIdentity[],
  inspector: ProcessInspector = createProcessInspector(),
): Promise<void> {
  const unique = uniqueProcessIdentities(identities)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline && unique.some(identity => inspector.isAlive(identity))) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const remaining = unique.filter(identity => inspector.isAlive(identity))
  if (remaining.length > 0) {
    throw new Error(`Electron acceptance left ${String(remaining.length)} owned process identities running`)
  }
}

/**
 * Stop only matching process identities, escalating after a bounded TERM wait.
 * @param identities - PID and start identities captured by this acceptance run.
 * @param inspector - Platform process-table inspector.
 */
export async function terminateOwnedProcesses(
  identities: readonly ProcessIdentity[],
  inspector: ProcessInspector = createProcessInspector(),
): Promise<void> {
  const unique = uniqueProcessIdentities(identities)
  for (const identity of unique.filter(identity => inspector.isAlive(identity))) {
    inspector.signalProcess(identity, 'SIGTERM')
  }
  const termDeadline = Date.now() + 5_000
  while (Date.now() < termDeadline && unique.some(identity => inspector.isAlive(identity))) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  for (const identity of unique.filter(identity => inspector.isAlive(identity))) {
    inspector.signalProcess(identity, 'SIGKILL')
  }
  await assertOwnedProcessesExited(unique, inspector)
}

/**
 * Remove a runner scratch tree only after every acquired owner reaches quiescence.
 * @param root - Private scratch root owned by one runner invocation.
 * @param ownersQuiescent - Whether all acquired model and process owners stopped.
 * @param removeTree - Filesystem removal operation.
 * @returns Whether the scratch tree was removed; false means it remains for safe diagnosis.
 */
export async function removeScratchIfOwnersQuiescent(
  root: string,
  ownersQuiescent: boolean,
  removeTree: typeof rm = rm,
): Promise<boolean> {
  if (!ownersQuiescent) return false
  await removeTree(root, { recursive: true, force: true })
  return true
}

/**
 * Wait for all owned Electron and Host processes to exit.
 * @param pids - Exact process ids recorded by the acceptance run.
 */
export async function assertProcessesExited(pids: readonly number[]): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline && pids.some(processExists)) await new Promise(resolve => setTimeout(resolve, 100))
  const remaining = pids.filter(processExists)
  if (remaining.length > 0) throw new Error(`Electron acceptance left owned processes running: ${remaining.join(', ')}`)
}

/**
 * Stop exact owned Electron and Host processes, escalating after a bounded TERM wait.
 * @param pids - Exact process ids recorded by the acceptance run.
 */
export async function terminateProcesses(pids: readonly number[]): Promise<void> {
  const unique = [...new Set(pids)]
  for (const pid of unique) signalProcess(pid, 'SIGTERM')
  const termDeadline = Date.now() + 5_000
  while (Date.now() < termDeadline && unique.some(processExists)) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  for (const pid of unique.filter(processExists)) signalProcess(pid, 'SIGKILL')
  await assertProcessesExited(unique)
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    throw error
  }
}

function uniqueProcessIdentities(identities: readonly ProcessIdentity[]): ProcessIdentity[] {
  const result: ProcessIdentity[] = []
  for (const identity of identities) mergeProcessIdentity(result, identity)
  return result
}

function mergeProcessIdentity(target: ProcessIdentity[], identity: ProcessIdentity): void {
  const existing = target.find(candidate => candidate.pid === identity.pid)
  if (existing === undefined) {
    target.push(identity)
    return
  }
  if (existing.started !== identity.started) {
    throw new Error(`Electron acceptance observed conflicting identities for PID ${String(identity.pid)}`)
  }
}
