import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifySha256 } from '../scripts/verify-sha256.mjs'

describe('verifySha256', () => {
  it('accepts a matching digest and rejects a changed archive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gestalt-sha-'))
    const archive = join(dir, 'archive')
    await writeFile(archive, 'payload')

    await expect(verifySha256(
      archive,
      '239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5',
    )).resolves.toBeUndefined()
    await expect(verifySha256(archive, '0'.repeat(64))).rejects.toThrow('SHA-256 mismatch')
  })
})
