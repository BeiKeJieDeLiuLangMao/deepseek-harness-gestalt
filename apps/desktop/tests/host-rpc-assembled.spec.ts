import { accessSync, constants as fsConstants, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
import { DesktopCompanionOperationLedger } from '../src/companion-operation-ledger.ts'
import { DesktopCompanionProductOwner, handleCompanionProductOperation } from '../src/companion-product.ts'
import {
  archiveDesktopHostSession,
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostSession,
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
  home?: string,
): Promise<{ home: string; running: RunningWebHost }> {
  const resolved = home ?? await mkdtemp(join(tmpdir(), 'dsh-desktop-host-rpc-'))
  if (home === undefined) homes.push(resolved)
  const homeDir = resolved
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
    env: { ...cleanEnvironment(homeDir), ...env },
  }, 90_000)
  children.push(running)
  return { home: homeDir, running }
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
      const frames: unknown[] = []
      const follow = new AbortController()
      const watching = rpc.followSession(sessionId, follow.signal, (frame) => { frames.push(frame) })
      try {
        await expect(handleCompanionProductOperation(submit, { ...pairing, host: rpc })).resolves.toMatchObject({
          type: 'confirmed', operationId: submit.operationId,
        })
        await expect.poll(async () => {
          const log = await durableSessionLog(first.home, sessionId)
          return log.includes(`"rpcId":"${submit.operationId}"`)
        }).toBe(true)
        await expect.poll(() => llm.requests.length > 0).toBe(true)
        await expect.poll(() => frames.some(frame => followHasTurnStart(frame))).toBe(true)
        expect(frames.some(frame => followHasUserRequest(frame, submit.operationId))).toBe(true)
        const llmCallsBeforeCancel = llm.requests.length
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
        expect(llm.requests.length).toBe(llmCallsBeforeCancel)
        const latest = [...frames].reverse().find(frame => isRecord(frame) && frame.type === 'snapshot')
          ?? frames.find(frame => isRecord(frame) && frame.type === 'snapshot')
        if (!isRecord(latest) || typeof latest.cursor !== 'number') throw new Error('missing follow snapshot')
        const paged = await pageDesktopHostSession(rpc, { sessionId, throughSeq: latest.cursor, maxMessages: 20 })
        expect(paged.ok).toBe(true)
      } finally {
        follow.abort()
        await watching
      }
    } finally {
      await llm.close()
    }
  }, 180_000)

  it('answers one shipped Host ask_user_question through $events/result', async () => {
    const apiKey = 'desktop-assembled-ask-user-key'
    const llm = await startMockLlmServer({
      sequence: ['tool_call_success', 'success'],
      apiKey,
      toolName: 'ask_user_question',
      toolArguments: JSON.stringify({
        questions: [{
          id: 'q1',
          question: 'Continue?',
          options: [{ label: 'Yes' }],
        }],
      }),
      successText: 'acknowledged-ask-user',
    })
    try {
      const first = await startShippedHost({
        DEEPSEEK_API_KEY: apiKey,
        DEEPSEEK_BASE_URL: llm.baseURL,
      })
      const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
      const owner = new DesktopCompanionProductOwner({
        timeoutMs: 15_000,
        responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      })
      const ledger = await DesktopCompanionOperationLedger.load({
        load: async () => [],
        save: async () => {},
      })
      owner.installLedger(ledger)
      const uninstall = owner.installHost(first.running.url, cookie)
      const rpc = createDesktopHostRpc(first.running.url, {
        timeoutMs: 15_000,
        responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
        cookieHeader: cookie,
      })
      const sessionId = parseCompanionSessionId('desktop-ask-user-session')
      const attachmentKey = new Uint8Array(32)
      const pairing = {
        pairingId: parsePersonalPairingId('pairing-ask-user'),
        attachmentKey,
        now: () => 1_000,
        downloadAttachment: async () => { throw new Error('ask-user must not download') },
        submitAttachment: async () => { throw new Error('ask-user must not submit attachments') },
        generation: 1,
        desktopRevision: 1,
        desktopName: 'Assembled Desktop',
        resolveInteraction: () => undefined,
        pendingInteractions: () => [],
      }
      try {
        await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
          ok: true, value: { sessionId },
        })
        const submit = {
          type: 'submit-prompt' as const,
          operationId: parseCompanionOperationId('desktop-ask-user-prompt'),
          sessionId,
          text: 'ask the user one question',
        }
        await expect(owner.handle(submit, pairing)).resolves.toMatchObject({
          type: 'confirmed', operationId: submit.operationId,
        })
        await expect.poll(() => owner.pendingInteractions(sessionId, attachmentKey).length > 0).toBe(true)
        const pending = owner.pendingInteractions(sessionId, attachmentKey)[0]
        if (pending === undefined || pending.kind !== 'question') throw new Error('missing Ask User wait')
        await expect(owner.handle({
          type: 'settle-interaction',
          operationId: parseCompanionOperationId('desktop-ask-user-answer'),
          sessionId,
          interactionId: pending.interactionId,
          settlement: { kind: 'question', answers: [{ id: 'q1', selected: ['Yes'] }] },
        }, pairing)).resolves.toMatchObject({ type: 'interaction-receipt', accepted: true })
        await expect.poll(async () => {
          const log = await durableSessionLog(first.home, sessionId)
          return log.includes('acknowledged-ask-user')
        }).toBe(true)
        expect(owner.pendingInteractions(sessionId, attachmentKey)).toHaveLength(0)
      } finally {
        uninstall()
      }
    } finally {
      await llm.close()
    }
  }, 180_000)

  it('allows one shipped Host bash escalation and writes the scratch file once', async () => {
    await runAssembledApproval({
      sessionId: 'desktop-approval-allow-session',
      outcome: 'allowed-once',
      expectWritten: true,
    })
  }, 180_000)

  it('rejects one shipped Host bash escalation and never writes the scratch file', async () => {
    await runAssembledApproval({
      sessionId: 'desktop-approval-reject-session',
      outcome: 'rejected',
      expectWritten: false,
    })
  }, 180_000)

  it('invalidates Companion list from shipped Host api-session notices', async () => {
    const first = await startShippedHost()
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    const uninstall = owner.installHost(first.running.url, cookie)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const sessionId = parseCompanionSessionId('desktop-list-notice-session')
    const changes: unknown[] = []
    const disconnect = owner.connectLiveProjection(
      parsePersonalPairingId('pairing-list-notice'),
      (change) => { changes.push(change) },
      () => {},
    )
    try {
      await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
        ok: true, value: { sessionId },
      })
      await expect.poll(() => {
        return changes.filter(change => isRecord(change) && change.type === 'surface').length >= 1
      }).toBe(true)
      await expect(listDesktopHostSessions(rpc)).resolves.toMatchObject({
        ok: true,
        value: { items: expect.arrayContaining([expect.objectContaining({ sessionId })]) },
      })
      const surfaces = changes.filter(change => isRecord(change) && change.type === 'surface').length
      await expect(archiveDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({ ok: true })
      await expect.poll(() => {
        return changes.filter(change => isRecord(change) && change.type === 'surface').length > surfaces
      }).toBe(true)
    } finally {
      disconnect()
      uninstall()
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

function followHasEventType(frame: unknown, type: string): boolean {
  if (!isRecord(frame)) return false
  if (frame.type === 'event') return isRecord(frame.event) && frame.event.type === type
  if (frame.type !== 'snapshot' || !Array.isArray(frame.records)) return false
  return frame.records.some(record => isRecord(record) && isRecord(record.event) && record.event.type === type)
}

function followHasTurnStart(frame: unknown): boolean {
  return followHasEventType(frame, 'turn/start')
}

function followHasTurnEnd(frame: unknown): boolean {
  return followHasEventType(frame, 'turn/end')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function runAssembledApproval(input: {
  sessionId: string
  outcome: 'allowed-once' | 'rejected'
  expectWritten: boolean
}): Promise<void> {
  const apiKey = `desktop-assembled-approval-${input.outcome}`
  const marker = `desktop-approval-${input.outcome}`
  const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-host-rpc-'))
  homes.push(home)
  const workspace = join(home, 'workspace')
  const scratch = join(home, 'scratch', 'approval-scratch.txt')
  mkdirSync(workspace, { recursive: true })
  mkdirSync(join(home, 'scratch'), { recursive: true })
  const llm = await startMockLlmServer({
    sequence: ['tool_call_success', 'success'],
    apiKey,
    toolName: 'bash',
    toolArguments: JSON.stringify({
      command: `printf ${marker} >> ${JSON.stringify(scratch)}`,
      description: 'Append one approval marker to the isolated Host scratch file',
      sandbox_permissions: 'danger-full-access',
      justification: 'Assembled Companion approval must observe one exclusive scratch write.',
    }),
    successText: `approval-${input.outcome}-done`,
  })
  try {
    const first = await startShippedHost({
      DEEPSEEK_API_KEY: apiKey,
      DEEPSEEK_BASE_URL: llm.baseURL,
      DSH_PERMISSION_MODE: 'workspace-write',
    }, home)
    const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    const ledger = await DesktopCompanionOperationLedger.load({
      load: async () => [],
      save: async () => {},
    })
    owner.installLedger(ledger)
    const uninstall = owner.installHost(first.running.url, cookie)
    const rpc = createDesktopHostRpc(first.running.url, {
      timeoutMs: 15_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const sessionId = parseCompanionSessionId(input.sessionId)
    const attachmentKey = new Uint8Array(32)
    const pairing = {
      pairingId: parsePersonalPairingId('pairing-approval'),
      attachmentKey,
      now: () => 1_000,
      downloadAttachment: async () => { throw new Error('approval must not download') },
      submitAttachment: async () => { throw new Error('approval must not submit attachments') },
      generation: 1,
      desktopRevision: 1,
      desktopName: 'Assembled Desktop',
      resolveInteraction: () => undefined,
      pendingInteractions: () => [],
    }
    try {
      await expect(createDesktopHostSession(rpc, sessionId, { cwd: workspace })).resolves.toMatchObject({
        ok: true, value: { sessionId },
      })
      const submit = {
        type: 'submit-prompt' as const,
        operationId: parseCompanionOperationId(`desktop-approval-${input.outcome}-prompt`),
        sessionId,
        text: 'escalate one bash write',
      }
      await expect(owner.handle(submit, pairing)).resolves.toMatchObject({
        type: 'confirmed', operationId: submit.operationId,
      })
      await expect.poll(() => {
        return owner.pendingInteractions(sessionId, attachmentKey).some(item => item.kind === 'approval')
      }).toBe(true)
      const pending = owner.pendingInteractions(sessionId, attachmentKey).find(item => item.kind === 'approval')
      if (pending === undefined) throw new Error('missing Approval wait')
      const settle = {
        type: 'settle-interaction' as const,
        operationId: parseCompanionOperationId(`desktop-approval-${input.outcome}-answer`),
        sessionId,
        interactionId: pending.interactionId,
        settlement: { kind: 'approval' as const, outcome: input.outcome },
      }
      await expect(owner.handle(settle, pairing)).resolves.toMatchObject({
        type: 'interaction-receipt', accepted: true,
      })
      await expect(owner.handle(settle, pairing)).resolves.toMatchObject({
        type: 'interaction-receipt', accepted: true,
      })
      await expect.poll(() => owner.pendingInteractions(sessionId, attachmentKey)).toEqual([])
      if (input.expectWritten) {
        await expect.poll(() => {
          try {
            return readFileSync(scratch, 'utf8')
          } catch {
            return ''
          }
        }).toBe(marker)
      } else {
        await expect.poll(async () => {
          const log = await durableSessionLog(first.home, sessionId)
          return log.includes('the user rejected escalating this command')
        }).toBe(true)
        expect(() => accessSync(scratch, fsConstants.F_OK)).toThrow()
      }
      await expect(owner.handle({
        type: 'settle-interaction',
        operationId: parseCompanionOperationId(`desktop-approval-${input.outcome}-late`),
        sessionId,
        interactionId: pending.interactionId,
        settlement: { kind: 'approval', outcome: 'rejected' },
      }, pairing)).resolves.toMatchObject({
        type: 'interaction-receipt', accepted: false, reason: 'not-pending',
      })
    } finally {
      uninstall()
    }
  } finally {
    await llm.close()
  }
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
