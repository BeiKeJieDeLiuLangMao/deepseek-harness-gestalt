import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  parseCompanionOperationId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionSearchSessionsOperation,
} from '@deepseek-ai/dsh-remote-protocol'
import { DesktopCompanionProductOwner } from '../src/companion-product.ts'
import { createDesktopHostRpc } from '../src/host-rpc.ts'
import { spawnWebHost, type RunningWebHost } from '../src/spawn-web-host.ts'
import { runHost400CodecProbe } from './host-400-codec-probe.ts'
import { startKeylessDesktopProvider } from './keyless-provider.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const desktopPatch = join(here, '..', 'cordis.patch.yml')
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

describe('assembled Desktop Companion Host search', () => {
  it('indexes a real Desktop Session and returns authoritative hit and no-hit results', async () => {
    const provider = await startKeylessDesktopProvider()
    cleanups.push(async () => { await provider.close() })
    const assembled = await startDesktopHost(provider.origin)
    await seedSession(assembled.host.url, assembled.sessionId, 'desktop assembled SQLite needle')
    const owner = productOwner(assembled.host.url)

    let hit = await search(owner, 'desktop assembled SQLite needle', 'assembled-hit')
    await expect.poll(async () => {
      hit = await search(owner, 'desktop assembled SQLite needle', 'assembled-hit')
      return hit.type === 'session-search'
        && hit.items.some(item => item.sessionId === assembled.sessionId && item.snippet.includes('SQLite needle'))
    }, { timeout: 15_000 }).toBe(true)
    expect(hit).toMatchObject({
      type: 'session-search',
      hasMore: false,
    })
    await expect(search(owner, 'definitely absent companion phrase', 'assembled-no-hit')).resolves.toEqual({
      type: 'session-search',
      operationId: parseCompanionOperationId('assembled-no-hit'),
      items: [],
      hasMore: false,
    })
  }, 45_000)

  it('encodes a real Host HTTP 400 as one Companion result', async () => {
    await expect(runHost400CodecProbe()).resolves.toBeInstanceOf(Uint8Array)
  })

  it.each(['disabled', 'index-failure'] as const)(
    'projects a real Desktop %s search-provider failure',
    async (scenario) => {
      const provider = await startKeylessDesktopProvider()
      cleanups.push(async () => { await provider.close() })
      const assembled = await startDesktopHost(provider.origin, scenario)
      await seedSession(assembled.host.url, assembled.sessionId, `desktop ${scenario} needle`)
      const owner = productOwner(assembled.host.url)

      const failure = await search(owner, `desktop ${scenario} needle`, `assembled-${scenario}`)
      expect(failure).toMatchObject({
        type: 'operation-failed',
        operationId: parseCompanionOperationId(`assembled-${scenario}`),
        failure: {
          kind: 'business',
          code: 'internal',
        },
      })
      if (failure.type !== 'operation-failed') throw new Error('expected search failure')
      expect(failure.failure.message).toContain('session search failed')
    },
    45_000,
  )
})

async function startDesktopHost(
  providerOrigin: string,
  scenario?: 'disabled' | 'index-failure',
): Promise<{ host: RunningWebHost; sessionId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-companion-assembled-'))
  cleanups.push(async () => { await rm(root, { recursive: true, force: true }) })
  const patches = [desktopPatch]
  if (scenario !== undefined) {
    const scenarioPatch = join(root, `${scenario}.yml`)
    const indexPath = scenario === 'index-failure' ? join(root, 'index-directory') : join(root, 'disabled.sqlite')
    if (scenario === 'index-failure') await mkdir(indexPath)
    await writeFile(scenarioPatch, [
      '- id: session-query-sqlite',
      '  config:',
      `    path: ${JSON.stringify(indexPath)}`,
      `    openAt: ${scenario === 'disabled' ? 'never' : 'first-search'}`,
      '',
    ].join('\n'))
    patches.push(scenarioPatch)
  }
  const tsxLoader = pathToFileURL(createRequire(join(repo, 'package.json')).resolve('tsx')).href
  const bin = join(repo, 'apps', 'cli', 'src', 'bin.ts')
  const host = await spawnWebHost({
    node: process.execPath,
    args: [
      '--import', tsxLoader, bin, 'web',
      ...patches.flatMap(patch => ['--patch', patch]),
      '--host', '127.0.0.1', '--port', '0',
    ],
    cwd: root,
    env: {
      DSH_HOME: join(root, '.dsh'),
      DSH_AGENTS_HOME: join(root, '.agents'),
      DEEPSEEK_API_KEY: 'keyless-desktop-companion-assembled',
      DEEPSEEK_BASE_URL: providerOrigin,
      TSX_TSCONFIG_PATH: join(repo, 'tsconfig.json'),
    },
  })
  cleanups.push(async () => { await host.stop() })
  return { host, sessionId: `desktop-${scenario ?? 'indexed'}-session` }
}

async function seedSession(baseUrl: string, sessionId: string, text: string): Promise<void> {
  const rpc = createDesktopHostRpc(baseUrl, {
    timeoutMs: 10_000,
    responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
  })
  await expect(rpc.call('session.create', { sessionId })).resolves.toMatchObject({ ok: true })
  await expect(rpc.call('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text }],
  })).resolves.toMatchObject({ ok: true })
}

function productOwner(baseUrl: string): DesktopCompanionProductOwner {
  const owner = new DesktopCompanionProductOwner({
    timeoutMs: 10_000,
    responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
  })
  owner.installHost(baseUrl)
  return owner
}

async function search(owner: DesktopCompanionProductOwner, query: string, operationId: string) {
  const operation: CompanionSearchSessionsOperation = {
    type: 'search-sessions',
    operationId: parseCompanionOperationId(operationId),
    query,
  }
  return await owner.handle(operation, {
    pairingId: parsePersonalPairingId('desktop-companion-assembled-pairing'),
    pairingKey: new Uint8Array(32),
    now: Date.now,
    downloadAttachment: () => Promise.reject(new Error('search must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('search must not submit an attachment')),
  })
}
