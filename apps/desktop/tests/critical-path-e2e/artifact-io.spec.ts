import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  hasExactCompletedOwnTurn,
  parseSessionState,
  parseStoredSessionLog,
  readOptionalFile,
  readProcessEvidence,
  redactArtifactDiagnostic,
  removeSecretBearingArtifacts,
} from './artifact-io.ts'

describe('critical-path durable evidence', () => {
  it('rejects unbranded external Session id values', () => {
    expect(() => parseSessionState(JSON.stringify({
      mainSessionId: 17,
      childId: 'child',
      ownSideRequestCount: 1,
      permissionPreset: 'read-only',
    }))).toThrow('mainSessionId must be a non-empty string')
  })

  it('parses production JSONL through the format owner and requires the new turn to complete', () => {
    const before = [
      event(0, 'assistant/message', { text: 'route B response' }),
      event(1, 'user/message', { text: 'Check route B after restart.' }),
      event(2, 'request/header', {}),
    ]
    const incomplete = storedLog(before)

    expect(hasExactCompletedOwnTurn(
      incomplete,
      1,
      'Check route B after restart.',
      'route B response',
    )).toBe(false)

    const complete = storedLog([
      ...before,
      event(3, 'assistant/message', { text: 'route B response' }),
      event(4, 'turn/end', {}),
    ])
    expect(hasExactCompletedOwnTurn(
      complete,
      1,
      'Check route B after restart.',
      'route B response',
    )).toBe(true)

    const duplicateReply = storedLog([
      ...before,
      event(3, 'assistant/message', { text: 'route B response' }),
      event(4, 'assistant/message', { text: 'route B response' }),
      event(5, 'turn/end', {}),
    ])
    expect(hasExactCompletedOwnTurn(
      duplicateReply,
      1,
      'Check route B after restart.',
      'route B response',
    )).toBe(false)
  })

  it('rejects conflicting historical process identities', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-critical-process-evidence-'))
    try {
      await writeFile(join(root, 'processes.json'), JSON.stringify({
        create: {
          electron: { pid: 40, started: 'first' },
          ownedProcesses: [{ pid: 40, started: 'reused' }],
        },
      }))

      await expect(readProcessEvidence(root)).rejects.toThrow('conflicting identities for PID 40')
    } finally {
      await rm(root, { recursive: true })
    }
  })

  it('removes secret-bearing artifacts without returning or retaining their content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-critical-secret-scan-'))
    const leaked = join(root, 'runner.log')
    const safe = join(root, 'result.json')
    const secret = 'private-credential-value'
    try {
      await Promise.all([
        writeFile(leaked, `request token=${secret}\n`),
        writeFile(safe, '{"passed":false}\n'),
      ])

      await expect(removeSecretBearingArtifacts(root, [secret])).resolves.toBe(1)
      await expect(readOptionalFile(leaked)).resolves.toBeUndefined()
      await expect(readFile(safe, 'utf8')).resolves.toBe('{"passed":false}\n')
      expect(redactArtifactDiagnostic(`failed with token=${secret}`, [secret]))
        .toBe('failed with token=[REDACTED]')
    } finally {
      await rm(root, { recursive: true })
    }
  })
})

function storedLog(events: readonly Record<string, unknown>[]) {
  const lines = [
    JSON.stringify({
      type: 'session',
      version: 0,
      id: 'child',
      createdAt: 1,
      parentSession: 'main',
      seedLength: 0,
      origin: 'subagent',
      delegationDepth: 1,
    }),
    ...events.map(value => JSON.stringify(value)),
    '',
  ]
  return parseStoredSessionLog('/sessions/child/session.jsonl', Buffer.from(lines.join('\n')))
}

function event(seq: number, type: string, data: unknown): Record<string, unknown> {
  return { seq, type, time: seq + 1, data }
}
