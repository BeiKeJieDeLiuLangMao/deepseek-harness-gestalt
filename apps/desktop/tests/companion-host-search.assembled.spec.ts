/** Companion search against shipped `dsh web` generated `session/search`. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  parseCompanionOperationId,
  parseCompanionSessionId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionOperationFailedResult,
  type CompanionSearchSessionsOperation,
  type CompanionSessionSearchResult,
} from '@deepseek-ai/dsh-remote-protocol'
import { SESSION_SEARCH_RESULT_LIMIT } from '@deepseek-ai/dsh-api-session-controller/types'
import {
  archiveDesktopHostSession,
  bootstrapDesktopHostCookie, createDesktopHostRpc, createDesktopHostSession,
  promptDesktopHostSession,
} from '../src/host-rpc.ts'
import type { RunningWebHost } from '../src/spawn-web-host.ts'
import {
  generateDesktopHostTypertArtifacts,
  startShippedWebHost,
  stopShippedWebHosts,
} from './shipped-web-host.ts'

const children: RunningWebHost[] = []
const homes: string[] = []
const uninstalls: Array<() => void> = []
let DesktopCompanionProductOwner: typeof import('../src/companion-product.ts').DesktopCompanionProductOwner

beforeAll(async () => {
  generateDesktopHostTypertArtifacts()
  ;({ DesktopCompanionProductOwner } = await import('../src/companion-product.ts'))
}, 120_000)

afterEach(async () => {
  await disposeSearchFixtures()
})

/**
 * Abort owner mux subscriptions, then wait one I/O turn so `followEvents`
 * observes cancellation before the child is killed. Keep this in `finally`
 * as well as `afterEach` so a failed assertion still unsubscribes first.
 */
async function disposeSearchFixtures(): Promise<void> {
  try {
    for (const uninstall of uninstalls.splice(0).reverse()) uninstall()
    // `followEvents` settles abort on the WebSocket `close` turn, which is
    // after `AbortController.abort()` returns. Drain that turn before kill.
    await new Promise<void>((resolve) => { setImmediate(resolve) })
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
  } finally {
    await stopShippedWebHosts(children, homes)
  }
}

describe('assembled Desktop Companion Host search on shipped dsh web', () => {
  it('indexes a real Desktop Session and returns authoritative hit and no-hit results', async () => {
    const first = await startShippedWebHost({ children, homes })
    try {
      const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
      const rpc = createDesktopHostRpc(first.running.url, {
        timeoutMs: 15_000,
        responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
        cookieHeader: cookie,
      })
      const owner = productOwner(first.running.url, cookie)
      const sessionId = parseCompanionSessionId('desktop-companion-search-session')
      const needle = 'desktop assembled SQLite needle'
      await expect(createDesktopHostSession(rpc, sessionId)).resolves.toMatchObject({
        ok: true, value: { sessionId },
      })
      await expect(promptDesktopHostSession(rpc, {
        requestId: 'desktop-companion-search-prompt',
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: needle }],
      })).resolves.toMatchObject({ ok: true, value: { accepted: true } })

      let hit = await search(owner, needle, 'assembled-hit')
      await expect.poll(async () => {
        hit = await search(owner, needle, 'assembled-hit')
        return hit.type === 'session-search'
          && hit.items.some(item => item.sessionId === sessionId && item.snippet.includes('SQLite needle'))
      }, { timeout: 15_000 }).toBe(true)
      expect(hit).toMatchObject({
        type: 'session-search',
        hasMore: false,
      })
      if (hit.type !== 'session-search') throw new Error('expected session-search hit')
      expect(hit.items.length).toBeLessThanOrEqual(SESSION_SEARCH_RESULT_LIMIT)
      await expect(search(owner, 'definitely absent companion phrase', 'assembled-no-hit')).resolves.toEqual({
        type: 'session-search',
        operationId: parseCompanionOperationId('assembled-no-hit'),
        items: [],
        hasMore: false,
      })

      const archivedId = parseCompanionSessionId('desktop-companion-archived-session')
      const archivedNeedle = 'desktop assembled archived SQLite needle'
      await expect(createDesktopHostSession(rpc, archivedId)).resolves.toMatchObject({
        ok: true, value: { sessionId: archivedId },
      })
      await expect(promptDesktopHostSession(rpc, {
        requestId: 'desktop-companion-archived-prompt',
        sessionId: archivedId,
        mode: 'queue',
        content: [{ type: 'text', text: archivedNeedle }],
      })).resolves.toMatchObject({ ok: true, value: { accepted: true } })
      await expect.poll(async () => {
        const listed = await search(owner, archivedNeedle, 'assembled-archived-visible')
        return listed.type === 'session-search'
          && listed.items.some(item => item.sessionId === archivedId)
      }, { timeout: 15_000 }).toBe(true)
      await expect(archiveDesktopHostSession(rpc, archivedId)).resolves.toMatchObject({ ok: true })
      await expect.poll(async () => {
        const hidden = await search(owner, archivedNeedle, 'assembled-archived-hidden')
        return hidden.type === 'session-search'
          && hidden.items.every(item => item.sessionId !== archivedId)
      }, { timeout: 15_000 }).toBe(true)
    } finally {
      await disposeSearchFixtures()
    }
  }, 180_000)

  it.each(['disabled', 'index-failure'] as const)(
    'projects a real Desktop %s search-provider failure',
    async (scenario) => {
      const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-host-rpc-'))
      homes.push(home)
      if (scenario === 'index-failure') {
        mkdirSync(join(home, '.dsh', 'session-search.sqlite'), { recursive: true })
      }
      const extraPatches = scenario === 'disabled' ? [writeDisabledSearchPatch(home)] : []
      const first = await startShippedWebHost({ home, extraPatches, children, homes })
      try {
        const cookie = await bootstrapDesktopHostCookie(first.running.launchUrl, first.running.url)
        const rpc = createDesktopHostRpc(first.running.url, {
          timeoutMs: 15_000,
          responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
          cookieHeader: cookie,
        })
        const sessionId = parseCompanionSessionId(`desktop-companion-${scenario}-session`)
        const workspace = join(home, 'workspace')
        mkdirSync(workspace, { recursive: true })
        await expect(createDesktopHostSession(rpc, sessionId, { cwd: workspace })).resolves.toMatchObject({
          ok: true, value: { sessionId },
        })
        const owner = productOwner(first.running.url, cookie)
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
      } finally {
        await disposeSearchFixtures()
      }
    },
    180_000,
  )
})

function writeDisabledSearchPatch(home: string): string {
  const path = join(home, 'session-query-disabled.patch.yml')
  writeFileSync(path, [
    '- id: session-query-sqlite',
    '  config:',
    "    path: !!js dshHomePath('session-search.sqlite')",
    '    openAt: never',
    '',
  ].join('\n'))
  return path
}

function productOwner(baseUrl: string, cookieHeader: string): InstanceType<typeof DesktopCompanionProductOwner> {
  const owner = new DesktopCompanionProductOwner({
    timeoutMs: 15_000,
    responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
  })
  uninstalls.push(owner.installHost(baseUrl, cookieHeader))
  return owner
}

async function search(
  owner: InstanceType<typeof DesktopCompanionProductOwner>,
  query: string,
  operationId: string,
): Promise<CompanionSessionSearchResult | CompanionOperationFailedResult> {
  const operation: CompanionSearchSessionsOperation = {
    type: 'search-sessions',
    operationId: parseCompanionOperationId(operationId),
    query,
  }
  const output = await owner.handle(operation, {
    pairingId: parsePersonalPairingId('desktop-companion-assembled-pairing'),
    attachmentKey: new Uint8Array(32),
    now: Date.now,
    generation: 1,
    desktopRevision: 1,
    desktopName: 'Assembled Desktop',
    downloadAttachment: () => Promise.reject(new Error('search must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('search must not submit an attachment')),
    resolveInteraction: () => undefined,
    pendingInteractions: () => [],
  })
  if (Array.isArray(output)
    || output.type === 'foreground-sync'
    || output.type === 'transcript-page'
    || output.type === 'surface-snapshot'
    || output.type === 'conversation-snapshot'
    || (output.type !== 'session-search' && output.type !== 'operation-failed')) {
    throw new Error('assembled search returned an invalid output kind')
  }
  return output
}
