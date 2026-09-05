import { mkdirSync, writeFileSync } from 'node:fs'
import { glob, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decompressZstdFrame, scanZstdFrames } from '../../../packages/session/session-persistence-jsonl/src/zstd.ts'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import { REMOTE_PROTOCOL_LIMITS } from '@deepseek-ai/dsh-remote-protocol'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { parseCompanionOperationId, parseCompanionSessionId } from '@deepseek-ai/dsh-remote-protocol'
import { handleCompanionProductOperation } from '../src/companion-product.ts'
import {
  archiveDesktopHostSession,
  bootstrapDesktopHostCookie, cancelDesktopHostSession, createDesktopHostRpc, createDesktopHostSession,
  createDesktopHostWorkspace,
  listDesktopHostSessions, pageDesktopHostSession,
} from '../src/host-rpc.ts'
import { spawnWebHost, type RunningWebHost } from '../src/spawn-web-host.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const children: RunningWebHost[] = []
const homes: string[] = []

const TYPERT_PACKAGES = [
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-settings-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-browser-workspace',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-cordis-host-runner',
  '@deepseek-ai/dsh-goal',
  '@deepseek-ai/dsh-host-plugin-inventory',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-member-question-receiver',
  '@deepseek-ai/dsh-message-feedback',
  '@deepseek-ai/dsh-session-reference',
  '@deepseek-ai/dsh-subagent',
] as const

beforeAll(() => {
  const artifacts = new WorkspaceTypertGenerator(repo)
    .generate([...TYPERT_PACKAGES], ['host'])
  for (const artifact of artifacts) {
    const output = join(repo, artifact.packageRoot, 'lib')
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
    writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
    if (artifact.remote === undefined) continue
    writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
}, 120_000)

afterEach(async () => {
  await Promise.all(children.splice(0).map(running => running.stop()))
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
})

function cleanEnvironment(home: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/iu.test(name)))
  return {
    ...env,
    DSH_AGENTS_HOME: join(home, '.agents'),
    DSH_HOME: join(home, '.dsh'),
    DSH_TELEMETRY_DISABLED: '1',
    NODE_NO_WARNINGS: '1',
    SSH_CONNECTION: '',
    SSH_TTY: '',
    TSX_TSCONFIG_PATH: join(repo, 'tsconfig.json'),
  }
}

async function startShippedHost(
  env: NodeJS.ProcessEnv = {},
): Promise<{ home: string; running: RunningWebHost }> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-host-rpc-'))
  homes.push(home)
  const tsx = new URL('../../../node_modules/tsx/dist/esm/index.mjs', import.meta.url).href
  const running = await spawnWebHost({
    node: process.execPath,
    args: [
      '--import', tsx,
      join(repo, 'apps/cli/src/bin.ts'),
      'web', '--patch', join(here, 'fixtures/host-rpc-auth.patch.yml'),
      '--no-open', '--host', '127.0.0.1', '--port', '0',
    ],
    cwd: repo,
    env: { ...cleanEnvironment(home), ...env },
  }, 90_000)
  children.push(running)
  return { home, running }
}

describe('Desktop Host RPC against shipped dsh web', () => {
  it('bootstraps the launch token and lists Sessions through generated session/list', async () => {
    const first = await startShippedHost()
    expect(first.running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(first.running.launchUrl.startsWith(`${first.running.url}/?token=`)).toBe(true)
    expect(first.running.launchUrl).not.toBe(first.running.url)

    const anonymous = createDesktopHostRpc(first.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    await expect(listDesktopHostSessions(anonymous)).resolves.toMatchObject({
      ok: false,
      failure: { kind: 'http', code: 'HOST_HTTP_STATUS', status: 401 },
    })

    await expect(bootstrapDesktopHostCookie(
      first.running.launchUrl.replace(first.running.url, 'http://127.0.0.1:9'),
      first.running.url,
    )).rejects.toThrow(/same-origin loopback launch URL/)

    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    expect(cookie).toMatch(/^dsh-auth-[^=]+=/)
    const authed = createDesktopHostRpc(first.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const listed = await listDesktopHostSessions(authed)
    expect(listed).toMatchObject({ ok: true, value: { items: expect.any(Array) } })

    const firstLaunch = first.running.launchUrl
    await first.running.stop()
    children.splice(children.indexOf(first.running), 1)

    const second = await startShippedHost()
    await expect(listDesktopHostSessions(createDesktopHostRpc(second.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    }))).resolves.toMatchObject({
      ok: false,
      failure: { kind: 'http', code: 'HOST_HTTP_STATUS', status: 401 },
    })
    await expect(bootstrapDesktopHostCookie(firstLaunch, second.running.url))
      .rejects.toThrow(/same-origin loopback launch URL|HTTP 401|cookie bootstrap/)
    const nextCookie = await bootstrapDesktopHostCookie(second.running.launchUrl, second.running.url)
    expect(nextCookie).not.toBe(cookie)
    await expect(listDesktopHostSessions(createDesktopHostRpc(second.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: nextCookie,
    }))).resolves.toMatchObject({ ok: true, value: { items: expect.any(Array) } })
  }, 180_000)

  it('follows generated session/follow, stops after unsubscribe, and reauths after Host restart', async () => {
    const first = await startShippedHost()
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const sessionId = 'desktop-follow-session'
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
      ok: true, value: { sessionId },
    })
    const frames: unknown[] = []
    const follow = new AbortController()
    const watching = rpc.followSession?.(sessionId, follow.signal, (frame) => { frames.push(frame) })
    await expect.poll(() => frames.some(frame => isRecord(frame) && frame.type === 'snapshot')).toBe(true)
    const seen = frames.length
    follow.abort()
    await expect(watching).resolves.toBeUndefined()
    await createDesktopHostSession(rpc, `${sessionId}-after-unsub`)
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(frames.length).toBe(seen)

    await first.running.stop()
    children.splice(children.indexOf(first.running), 1)
    const second = await startShippedHost()
    const stale = createDesktopHostRpc(second.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const staleFollow = new AbortController()
    await expect(stale.followSession?.(sessionId, staleFollow.signal, () => {})).rejects.toThrow()
    const nextCookie = await bootstrapDesktopHostCookie(second.running.launchUrl, second.running.url)
    const next = createDesktopHostRpc(second.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: nextCookie,
    })
    await expect(createDesktopHostSession(next, sessionId)).resolves.toMatchObject({
      ok: true, value: { sessionId },
    })
    const restarted: unknown[] = []
    const restartFollow = new AbortController()
    const restartWatch = next.followSession?.(sessionId, restartFollow.signal, (frame) => {
      restarted.push(frame)
    })
    await expect.poll(() => restarted.some(frame => isRecord(frame) && frame.type === 'snapshot')).toBe(true)
    const snapshot = restarted.find(frame => isRecord(frame) && frame.type === 'snapshot')
    if (!isRecord(snapshot) || typeof snapshot.cursor !== 'number') throw new Error('missing follow snapshot')
    await expect(pageDesktopHostSession(next, {
      sessionId, throughSeq: snapshot.cursor, maxMessages: 20,
    })).resolves.toMatchObject({ ok: true, value: { records: expect.any(Array), hasMore: expect.any(Boolean) } })
    restartFollow.abort()
    await expect(restartWatch).resolves.toBeUndefined()
  }, 180_000)

  it('follows generated workspace/follow, applies a create increment, and reauths after Host restart', async () => {
    const first = await startShippedHost()
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const frames: unknown[] = []
    const follow = new AbortController()
    const watching = rpc.followWorkspaces?.(follow.signal, (frame) => { frames.push(frame) })
    await expect.poll(() => frames.some(frame => isRecord(frame) && frame.type === 'baseline')).toBe(true)
    const created = await createDesktopHostWorkspace(rpc, first.home)
    expect(created.ok).toBe(true)
    if (!created.ok || !isRecord(created.value) || !isRecord(created.value.workspace)
      || typeof created.value.workspace.path !== 'string') {
      throw new Error('Desktop Host workspace/create returned an invalid value')
    }
    expect(created.value.workspace.path).toContain('dsh-desktop-host-rpc-')
    await expect.poll(() => frames.some(frame => isRecord(frame) && frame.type === 'upsert')).toBe(true)
    const seen = frames.length
    follow.abort()
    await expect(watching).resolves.toBeUndefined()
    await createDesktopHostWorkspace(rpc, join(first.home, '.agents'))
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(frames.length).toBe(seen)

    await first.running.stop()
    children.splice(children.indexOf(first.running), 1)
    const second = await startShippedHost()
    const stale = createDesktopHostRpc(second.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const staleFollow = new AbortController()
    await expect(stale.followWorkspaces?.(staleFollow.signal, () => {})).rejects.toThrow()
    const nextCookie = await bootstrapDesktopHostCookie(second.running.launchUrl, second.running.url)
    const next = createDesktopHostRpc(second.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: nextCookie,
    })
    const restarted: unknown[] = []
    const restartFollow = new AbortController()
    const restartWatch = next.followWorkspaces?.(restartFollow.signal, (frame) => { restarted.push(frame) })
    await expect.poll(() => restarted.some(frame => isRecord(frame) && frame.type === 'baseline')).toBe(true)
    restartFollow.abort()
    await expect(restartWatch).resolves.toBeUndefined()
  }, 180_000)

  it('archives a Session through workspace/follow without exposing it after unsubscribe', async () => {
    const first = await startShippedHost()
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 10_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const sessionId = 'desktop-archived-session'
    await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
      ok: true, value: { sessionId },
    })
    const frames: unknown[] = []
    const follow = new AbortController()
    const watching = rpc.followWorkspaces?.(follow.signal, (frame) => { frames.push(frame) })
    await expect.poll(() => frames.some(frame => isRecord(frame) && frame.type === 'baseline')).toBe(true)
    await expect(archiveDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({ ok: true })
    await expect.poll(() => frames.some((frame) => {
      return isRecord(frame) && frame.type === 'archived'
        && Array.isArray(frame.archivedSessionIds) && frame.archivedSessionIds.includes(sessionId)
    })).toBe(true)
    const seen = frames.length
    follow.abort()
    await expect(watching).resolves.toBeUndefined()
    await archiveDesktopHostSession(rpc, `${sessionId}-after-unsub`)
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(frames.length).toBe(seen)
  }, 180_000)

  it('submits session/prompt with initiator requestId then cancels through session/cancel', async () => {
    const apiKey = 'desktop-assembled-prompt-key'
    const llm = await startMockLlmServer({ sequence: ['stall'], apiKey })
    try {
      const first = await startShippedHost({
        DEEPSEEK_API_KEY: apiKey,
        DEEPSEEK_BASE_URL: llm.baseURL,
      })
      const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
      const rpc = createDesktopHostRpc(first.running.url, {
        timeoutMs: 15_000,
        responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
        cookieHeader: cookie,
      })
      const sessionId = parseCompanionSessionId('desktop-prompt-session')
      await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
        ok: true, value: { sessionId },
      })
      const submit = {
        type: 'submit-prompt' as const,
        operationId: parseCompanionOperationId('desktop-prompt-operation'),
        sessionId,
        text: 'assembled companion prompt',
      }
      const pairing = {
        pairingId: parsePersonalPairingId('pairing-assembled'),
        attachmentKey: new Uint8Array(32),
        now: () => 1_000,
        downloadAttachment: async () => { throw new Error('assembled prompt must not download') },
        submitAttachment: async () => { throw new Error('assembled prompt must not submit attachments') },
        generation: 1,
        desktopRevision: 1,
        desktopName: 'Assembled Desktop',
        resolveInteraction: () => undefined,
        pendingInteractions: () => [],
        workspaceSnapshot: async () => ({ items: [], archivedSessionIds: [] }),
      }
      await expect(handleCompanionProductOperation(submit, { ...pairing, host: rpc })).resolves.toMatchObject({
        type: 'confirmed', operationId: submit.operationId,
      })
      await expect.poll(async () => {
        const log = await durableSessionLog(first.home, sessionId)
        return log.includes(`"rpcId":"${submit.operationId}"`)
      }).toBe(true)
      const frames: unknown[] = []
      const follow = new AbortController()
      const watching = rpc.followSession(sessionId, follow.signal, (frame) => { frames.push(frame) })
      await expect.poll(() => frames.some(frame => followHasUserRequest(frame, submit.operationId))).toBe(true)
      const llmCallsBeforeCancel = llm.requests.length
      expect(llmCallsBeforeCancel).toBeGreaterThan(0)
      await expect(handleCompanionProductOperation({
        type: 'cancel-session', operationId: parseCompanionOperationId('desktop-cancel-operation'), sessionId,
      }, { ...pairing, host: rpc })).resolves.toMatchObject({ type: 'confirmed' })
      await expect.poll(() => frames.some(frame => followHasTurnEnd(frame))).toBe(true)
      await expect.poll(async () => {
        const listed = await listDesktopHostSessions(rpc)
        if (!listed.ok || !isRecord(listed.value) || !Array.isArray(listed.value.items)) return false
        const row = listed.value.items.find(item => isRecord(item) && item.sessionId === sessionId)
        return isRecord(row) && row.running === false
      }).toBe(true)
      await new Promise(resolve => setTimeout(resolve, 400))
      expect(llm.requests.length).toBe(llmCallsBeforeCancel)
      follow.abort()
      await watching
      const snapshot = frames.find(frame => isRecord(frame) && frame.type === 'snapshot')
      if (!isRecord(snapshot) || typeof snapshot.cursor !== 'number') throw new Error('missing follow snapshot')
      const paged = await pageDesktopHostSession(rpc, { sessionId, throughSeq: snapshot.cursor, maxMessages: 20 })
      expect(paged.ok).toBe(true)
      await expect(cancelDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({ ok: true, value: { accepted: true } })
    } finally {
      await llm.close()
    }
  }, 180_000)
})

function followHasUserRequest(frame: unknown, requestId: string): boolean {
  if (!isRecord(frame)) return false
  const events = frame.type === 'event' ? [frame.event] : frame.type === 'snapshot' && Array.isArray(frame.records)
    ? frame.records.map(record => isRecord(record) ? record.event : undefined)
    : []
  return events.some((event) => {
    return isRecord(event) && event.type === 'user/message' && isRecord(event.data)
      && isRecord(event.data.source) && event.data.source.rpcId === requestId
  })
}

function followHasTurnEnd(frame: unknown): boolean {
  if (!isRecord(frame)) return false
  if (frame.type === 'event') {
    return isRecord(frame.event) && frame.event.type === 'turn/end'
  }
  if (frame.type !== 'snapshot' || !Array.isArray(frame.records)) return false
  return frame.records.some(record => isRecord(record) && isRecord(record.event) && record.event.type === 'turn/end')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function durableSessionLog(home: string, sessionId: string): Promise<string> {
  const root = join(home, '.dsh', 'sessions')
  const matches: string[] = []
  for await (const match of glob(`**/${sessionId}/session.jsonl.zstd`, { cwd: root })) {
    matches.push(match)
  }
  if (matches[0] === undefined) return ''
  const bytes = await readFile(join(root, matches[0]))
  const scan = scanZstdFrames(bytes)
  const chunks: Buffer[] = []
  for (const frame of scan.frames) {
    chunks.push(await decompressZstdFrame(bytes.subarray(frame.start, frame.end)))
  }
  return Buffer.concat(chunks).toString('utf8')
}
