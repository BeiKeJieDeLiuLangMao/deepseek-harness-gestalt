import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMembershipCutoverCommand, readMembershipCutoverSnapshot, writeMembershipCutoverSnapshot } from '../src/membership-cutover.ts'

describe('membership cutover snapshots', () => {
  it('requires a writer fence and exact operation arguments before acquiring database resources', () => {
    expect(() => parseMembershipCutoverCommand(['import', '--source', 'source.json', '--sha256', 'a'.repeat(64)])).toThrow('writers-fenced')
    expect(() => parseMembershipCutoverCommand(['export', '--output', 'current.json'])).toThrow('writers-fenced')
    expect(() => parseMembershipCutoverCommand(['capture', '--source', 'source.json', '--empty', '--output', 'copy.json'])).toThrow('exactly one')
    expect(() => parseMembershipCutoverCommand(['capture', '--output', 'copy.json'])).toThrow('exactly one')
    expect(() => parseMembershipCutoverCommand(['import', '--writers-fenced', '--source', 'source.json', '--sha256', 'a'])).toThrow('full lowercase')
    expect(parseMembershipCutoverCommand(['import', '--writers-fenced', '--source', 'source.json', '--sha256', 'a'.repeat(64)]))
      .toEqual({ kind: 'import', source: 'source.json', digest: 'a'.repeat(64) })
    expect(parseMembershipCutoverCommand(['export', '--writers-fenced', '--output', 'current.json']))
      .toEqual({ kind: 'export', output: 'current.json' })
  })

  it('preserves exact bytes in private backups and refuses absent, corrupted or overwritten sources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-membership-cutover-'))
    try {
      const snapshot = await readMembershipCutoverSnapshot(undefined)
      const output = join(root, 'private', 'snapshot.json')
      await writeMembershipCutoverSnapshot(output, snapshot)
      expect(await readFile(output, 'utf8')).toBe(snapshot.document)
      if (process.platform !== 'win32') {
        expect((await stat(output)).mode & 0o777).toBe(0o600)
        expect((await stat(join(root, 'private'))).mode & 0o777).toBe(0o700)
      }
      await expect(writeMembershipCutoverSnapshot(output, snapshot)).rejects.toMatchObject({ code: 'EEXIST' })
      await expect(readMembershipCutoverSnapshot(join(root, 'missing.json'))).rejects.toMatchObject({ code: 'ENOENT' })
      const invalid = join(root, 'invalid.json')
      await writeFile(invalid, '{"formatVersion":1}')
      await expect(readMembershipCutoverSnapshot(invalid)).rejects.toThrow()
      await expect(writeMembershipCutoverSnapshot(join(root, 'bad-digest.json'), { ...snapshot, digest: 'a'.repeat(64) })).rejects.toThrow('digest mismatch')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
