/** Session Controller Companion opaque-file admission. */

import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { createSessionTestRemote, installSessionReadTestServices } from './test-remote.ts'

const sid = (id: string): SessionId => id as SessionId
const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function pdfBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from('%PDF-1.4 companion file', 'utf8'))
}

function payload(data: Uint8Array, extras: {
  readonly sessionId?: SessionId
  readonly operationId?: string
  readonly mediaType?: string
  readonly name?: string
} = {}) {
  return {
    sessionId: extras.sessionId ?? sid('admit-source'),
    operationId: extras.operationId ?? 'op-1',
    mediaType: extras.mediaType ?? 'application/pdf',
    name: extras.name ?? 'notes.pdf',
    data: Buffer.from(data).toString('base64'),
  }
}

async function harness(maxByteBytes = 1024): Promise<{
  ctx: Context
  sessionId: SessionId
  remote: ReturnType<typeof createSessionTestRemote>
}> {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-admit-bytes-'))
  roots.push(dshHome)
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalAttachmentStore, { dshHome, maxByteBytes })
  await ctx.plugin(JsonlSessionPersistence, { root: join(dshHome, 'sessions'), compression: 'none' })
  installSessionReadTestServices(ctx)
  ctx.provide('workspaceRegistry', { list: () => [] } as never)
  ctx.agents.setFactory({
    createAgent: async (ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.create(options.sessionId, {
        ...options.seed === undefined ? {} : { seed: [...options.seed] },
        ...options.meta === undefined ? {} : { meta: options.meta },
      })
      const handle = await ctx.sessionPersistence.create(session.header)
      const agent = {} as Agent
      const agentCtx = ownerCtx.extend({ agent })
      Object.assign(agent, { id: session.id, session, status: 'idle', ctx: agentCtx })
      await options.setup?.(agentCtx)
      ctx.agents.register(agent)
      return {
        agent,
        dispose: async () => {
          await handle.close()
        },
      }
    },
    resume: () => Promise.reject(new Error('admit tests keep sources live')),
  })
  const session = ctx.sessions.create(sid('admit-source'), { meta: { cwd: '/proj' } })
  const liveHandle = await ctx.sessionPersistence.create(session.header)
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'context' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.effect(() => () => { void liveHandle.close() })
  ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)
  return {
    ctx,
    sessionId: session.id,
    remote: createSessionTestRemote(ctx, {
      defaultModelSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
      cwd: '/proj',
    }),
  }
}

describe('session.admitAttachment', () => {
  it('persists opaque bytes, records an ignorable admission, and is idempotent', async () => {
    const { ctx, sessionId, remote } = await harness()
    const data = pdfBytes()
    const first = await remote.admitAttachment(payload(data))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const sha256 = createHash('sha256').update(data).digest('hex')
    expect(first.value.attachment).toMatchObject({
      mediaType: 'application/pdf',
      bytes: data.byteLength,
      sha256,
      name: 'notes.pdf',
    })
    const retry = await remote.admitAttachment(payload(data))
    expect(retry.ok).toBe(true)
    if (!retry.ok) return
    expect(retry.value.attachment).toEqual(first.value.attachment)
    const session = ctx.sessions.get(sessionId)
    const admitted = session?.snapshotEvents().filter(event => event.type === 'session/attachment-admitted')
    expect(admitted).toHaveLength(1)
    expect(admitted?.[0]).toMatchObject({
      ignorable: true,
      data: { operationId: 'op-1', source: 'companion', attachment: first.value.attachment },
    })
    expect(session?.snapshotEvents().some(event => event.type === 'user/message'
      && JSON.stringify(event.data).includes('notes.pdf'))).toBe(false)
    await ctx.fiber.dispose()
  })

  it('normalizes Windows and POSIX path names for storage and retry matching', async () => {
    const { ctx, sessionId, remote } = await harness()
    const data = pdfBytes()
    const first = await remote.admitAttachment(payload(data, { name: 'C:\\Users\\a\\notes.pdf' }))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.attachment.name).toBe('notes.pdf')
    const retry = await remote.admitAttachment(payload(data, { name: '/home/a/notes.pdf' }))
    expect(retry.ok).toBe(true)
    if (!retry.ok) return
    expect(retry.value.attachment).toEqual(first.value.attachment)
    const empty = await remote.admitAttachment(payload(data, { operationId: 'op-empty', name: 'C:\\Users\\a\\' }))
    expect(empty.ok).toBe(false)
    if (empty.ok) return
    expect(empty.error).toMatchObject({
      code: 'session/attachment-invalid',
      details: { reason: 'INVALID_BYTE_NAME' },
    })
    expect(ctx.sessions.get(sessionId)?.snapshotEvents()
      .filter(event => event.type === 'session/attachment-admitted')).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('rejects a colliding operation id without appending a second event', async () => {
    const { ctx, sessionId, remote } = await harness()
    const first = await remote.admitAttachment(payload(pdfBytes()))
    expect(first.ok).toBe(true)
    const collision = await remote.admitAttachment(payload(
      Uint8Array.from(Buffer.from('other bytes', 'utf8')),
    ))
    expect(collision.ok).toBe(false)
    if (collision.ok) return
    expect(collision.error).toMatchObject({
      code: 'session/attachment-invalid',
      details: { reason: 'ATTACHMENT_OPERATION_COLLISION' },
    })
    expect(ctx.sessions.get(sessionId)?.snapshotEvents()
      .filter(event => event.type === 'session/attachment-admitted')).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('refuses oversized and malformed payloads before saveBytes', async () => {
    const { ctx, remote } = await harness(8)
    const over = await remote.admitAttachment(payload(Uint8Array.from(Buffer.from('0123456789', 'utf8'))))
    expect(over.ok).toBe(false)
    if (over.ok) return
    expect(over.error).toMatchObject({
      code: 'session/attachment-invalid',
      details: { reason: 'BYTES_TOO_LARGE' },
    })
    const malformed = await remote.admitAttachment({
      ...payload(pdfBytes()),
      data: '@@@',
    })
    expect(malformed).toMatchObject({ ok: false })
    const emptyName = await remote.admitAttachment(payload(pdfBytes(), { name: '' }))
    expect(emptyName.ok).toBe(false)
    await ctx.fiber.dispose()
  })

  it('serializes concurrent identical operation ids onto one recorded admission', async () => {
    const { ctx, sessionId, remote } = await harness()
    const data = pdfBytes()
    const [left, right] = await Promise.all([
      remote.admitAttachment(payload(data)),
      remote.admitAttachment(payload(data)),
    ])
    expect(left.ok && right.ok).toBe(true)
    if (!left.ok || !right.ok) return
    expect(left.value.attachment).toEqual(right.value.attachment)
    expect(ctx.sessions.get(sessionId)?.snapshotEvents()
      .filter(event => event.type === 'session/attachment-admitted')).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('withholds success until sessions.flush settles, including a prior-operation retry', async () => {
    const { ctx, sessionId, remote } = await harness()
    const data = pdfBytes()
    const jsonlRoot = join(roots[0] as string, 'sessions')
    let rejectFlush = true
    let flushCalls = 0
    ctx.on('session/flush', async () => {
      flushCalls += 1
      if (rejectFlush) throw new Error('flush barrier held')
    })
    const failed = await remote.admitAttachment(payload(data))
    expect(failed.ok).toBe(false)
    if (failed.ok) return
    expect(failed.error.code).toBe('gateway/internal')
    expect(flushCalls).toBe(1)
    const live = ctx.sessions.get(sessionId)?.snapshotEvents()
      .filter(event => event.type === 'session/attachment-admitted') ?? []
    expect(live).toHaveLength(1)
    rejectFlush = false
    const retried = await remote.admitAttachment(payload(data))
    expect(retried.ok).toBe(true)
    if (!retried.ok) return
    expect(flushCalls).toBe(2)
    expect(retried.value.attachment).toEqual(live[0]?.data.attachment)
    await ctx.fiber.dispose()

    const reader = new Context()
    await reader.plugin(SessionStore)
    await reader.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
    const handle = await reader.sessionPersistence.open(sessionId, 'read')
    try {
      const events = await handle.read()
      const admitted = events.filter(event => event.type === 'session/attachment-admitted')
      expect(admitted).toHaveLength(1)
      expect(admitted[0]).toMatchObject({
        type: 'session/attachment-admitted',
        ignorable: true,
        data: { operationId: 'op-1', source: 'companion', attachment: retried.value.attachment },
      })
    } finally {
      await handle.close()
    }
    await reader.fiber.dispose()
  })

  it('reopens the JSONL log with the ignorable admission still present', async () => {
    const { ctx, sessionId, remote } = await harness()
    const data = pdfBytes()
    const admitted = await remote.admitAttachment(payload(data))
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) return
    const jsonlRoot = join(roots[0] as string, 'sessions')
    await ctx.fiber.dispose()

    const reader = new Context()
    await reader.plugin(SessionStore)
    await reader.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
    const handle = await reader.sessionPersistence.open(sessionId, 'read')
    try {
      const events = await handle.read()
      const last = events.at(-1)
      expect(last?.type).toBe('session/attachment-admitted')
      expect(last).toMatchObject({
        ignorable: true,
        data: { operationId: 'op-1', source: 'companion' },
      })
    } finally {
      await handle.close()
    }
    await reader.fiber.dispose()
  })
})
