import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectCompanionPushResidue } from './verify-companion-no-push.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Companion push absence gate', () => {
  it('rejects product symbols, operations, secrets, and native dependencies without banning ordinary arrays', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-companion-no-push-'))
    roots.push(root)
    mkdirSync(join(root, 'apps/mobile/src'), { recursive: true })
    mkdirSync(join(root, 'packages/platform/remote-access/src'), { recursive: true })
    writeFileSync(join(root, 'apps/mobile/src/list.ts'), 'const values: string[] = []\nvalues.push("ok")\n')
    writeFileSync(join(root, 'apps/mobile/src/notifications.ts'), 'const provider = "APNs"\n')
    writeFileSync(join(root, 'packages/platform/remote-access/src/config.ts'), 'const secret = "PLATFORM_FCM_KEY"\n')

    expect(collectCompanionPushResidue(root)).toEqual([
      'apps/mobile/src/notifications.ts:1: contains forbidden Companion push product token APNs.',
      'packages/platform/remote-access/src/config.ts:1: contains forbidden Companion push product token FCM.',
    ])
  })

  it('finds no Companion push product residue in the repository', () => {
    expect(collectCompanionPushResidue(join(import.meta.dirname, '..'))).toEqual([])
  })
})
