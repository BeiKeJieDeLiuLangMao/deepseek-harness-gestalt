import {
  mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectAmbientCredentials,
  hasExactCompletedOwnTurn,
  parseSessionState,
  parseStoredSessionLog,
  readOptionalFile,
  readProcessEvidence,
  redactArtifactDiagnostic,
  scanRetainedArtifacts,
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

  it('selects credential fields without treating token-related configuration as credentials', () => {
    expect(collectAmbientCredentials({
      FIXTURE_API_KEY: 'api-key-value',
      FIXTURE_ACCESS_KEY_ID: 'access-key-id',
      FIXTURE_ACCESS_KEY_SECRET: 'access-key-secret',
      FIXTURE_PASSWORD: 'password-value',
      FIXTURE_TOKEN_VALUE: 'token-value',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '32000',
      QODER_EXPOSE_TOKEN_USAGE: '1',
      FIXTURE_PASSWORD_POLICY: 'strict',
      EMPTY_SECRET: '',
    })).toEqual([
      { name: 'FIXTURE_API_KEY', value: 'api-key-value' },
      { name: 'FIXTURE_ACCESS_KEY_ID', value: 'access-key-id' },
      { name: 'FIXTURE_ACCESS_KEY_SECRET', value: 'access-key-secret' },
      { name: 'FIXTURE_PASSWORD', value: 'password-value' },
      { name: 'FIXTURE_TOKEN_VALUE', value: 'token-value' },
    ])
  })

  it('removes secret-bearing artifacts without returning or retaining their content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-critical-secret-scan-'))
    const leaked = join(root, 'runner.log')
    const safe = join(root, 'result.json')
    const secret = 'private-credential-value'
    try {
      await Promise.all([
        writeFile(leaked, `provider output ${secret}\n`),
        writeFile(safe, '{"passed":false}\n'),
      ])

      const credentials = [{ name: 'FIXTURE_API_KEY', value: secret }]
      await expect(scanRetainedArtifacts(root, credentials)).resolves.toEqual({
        shareable: true,
        removedFiles: 1,
      })
      await expect(readOptionalFile(leaked)).resolves.toBeUndefined()
      await expect(readFile(safe, 'utf8')).resolves.toBe('{"passed":false}\n')
      expect(redactArtifactDiagnostic(`failed with ${secret}`, credentials))
        .toBe('failed with [REDACTED]')
      expect(redactArtifactDiagnostic(`failed with token=${secret}`, credentials))
        .toBe('failed with token=[REDACTED]')
    } finally {
      await rm(root, { recursive: true })
    }
  })

  it('requires credential context before matching a short ambient value', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-critical-short-secret-scan-'))
    const buildLog = join(root, 'build-0.log')
    const buildSource = join(root, 'build-source.json')
    const result = join(root, 'result.json')
    const namedLeak = join(root, 'named-leak.log')
    const genericLeak = join(root, 'generic-leak.json')
    const credentials = [{ name: 'FIXTURE_ACCESS_KEY_ID', value: '1' }]
    try {
      await Promise.all([
        writeFile(buildLog, 'command exited 1\n'),
        writeFile(buildSource, '{"exitCode":1}\n'),
        writeFile(result, '{"message":"pnpm exited 1"}\n'),
        writeFile(namedLeak, 'failure (FIXTURE_ACCESS_KEY_ID=1)\n'),
        writeFile(genericLeak, '{"authorization":"Bearer x"}\n'),
      ])

      await expect(scanRetainedArtifacts(root, credentials)).resolves.toEqual({
        shareable: true,
        removedFiles: 2,
      })
      await expect(readFile(buildLog, 'utf8')).resolves.toBe('command exited 1\n')
      await expect(readFile(buildSource, 'utf8')).resolves.toBe('{"exitCode":1}\n')
      await expect(readFile(result, 'utf8')).resolves.toBe('{"message":"pnpm exited 1"}\n')
      await expect(readOptionalFile(namedLeak)).resolves.toBeUndefined()
      await expect(readOptionalFile(genericLeak)).resolves.toBeUndefined()
      expect(redactArtifactDiagnostic('pnpm exited 1', credentials)).toBe('pnpm exited 1')
      expect(redactArtifactDiagnostic('failure (FIXTURE_ACCESS_KEY_ID=1)', credentials))
        .toBe('failure (FIXTURE_ACCESS_KEY_ID=[REDACTED])')
      expect(redactArtifactDiagnostic('{"authorization":"Bearer x"}', credentials))
        .toBe('{"authorization":"Bearer [REDACTED]"}')
    } finally {
      await rm(root, { recursive: true })
    }
  })

  it('matches a JSON-escaped ambient credential in scans and diagnostics', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-critical-json-secret-scan-'))
    const leaked = join(root, 'runner.json')
    const credential = { name: 'FIXTURE_ACCESS_KEY_SECRET', value: 'ab"cd\\efgh' }
    const diagnostic = JSON.stringify({ [credential.name]: credential.value })
    try {
      await writeFile(leaked, diagnostic + '\n')

      await expect(scanRetainedArtifacts(root, [credential])).resolves.toEqual({
        shareable: true,
        removedFiles: 1,
      })
      await expect(readOptionalFile(leaked)).resolves.toBeUndefined()
      expect(redactArtifactDiagnostic(diagnostic, [credential])).toBe(JSON.stringify({
        [credential.name]: '[REDACTED]',
      }))
    } finally {
      await rm(root, { recursive: true })
    }
  })

  it('marks a link-shaped artifact namespace unshareable without touching its target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-critical-link-scan-'))
    const artifacts = join(root, 'artifacts')
    const outside = join(root, 'outside')
    const link = join(artifacts, 'linked-output')
    const sentinel = join(outside, 'sentinel.txt')
    let linkCreated = false
    try {
      await Promise.all([mkdir(artifacts), mkdir(outside)])
      await writeFile(sentinel, 'must remain\n')
      await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
      linkCreated = true
      await expect(scanRetainedArtifacts(artifacts, [])).resolves.toEqual({ shareable: false })
      await expect(readFile(sentinel, 'utf8')).resolves.toBe('must remain\n')
    } finally {
      if (linkCreated) await unlink(link)
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
