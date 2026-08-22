import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectCompanionProductEntryResidue } from './verify-companion-product-entry.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Companion product-entry purity gate', () => {
  it('follows relative imports from each product entry and rejects proof-only composition', () => {
    const root = fixtureRoot({
      'apps/desktop/src/main.ts': "import './identity.ts'\n",
      'apps/desktop/src/identity.ts': "const login = 'octocat'\n",
      'apps/mobile/src/main.tsx': "void import('./keyless.ts')\n",
      'apps/mobile/src/keyless.ts': 'class DevelopmentKeylessMobileHandshakeClient {}\n',
      'apps/platform/src/boot.ts': "import './stores.ts'\n",
      'apps/platform/src/stores.ts': 'const store = new MemoryAccountBackend()\n',
    })

    expect(collectCompanionProductEntryResidue(root)).toEqual([
      'apps/desktop/src/identity.ts:1: contains fixed GitHub fixture identity.',
      'apps/mobile/src/keyless.ts:1: contains a keyless product provider.',
      'apps/platform/src/stores.ts:1: contains an in-memory product authority.',
    ])
  })

  it('does not scan unreachable named test fixtures', () => {
    const root = fixtureRoot({
      'apps/desktop/src/main.ts': "import './operated.ts'\n",
      'apps/desktop/src/operated.ts': "const origin = 'https://platform.example'\n",
      'apps/desktop/tests/fixtures/identity.ts': "const login = 'octocat'\n",
      'apps/mobile/src/main.tsx': "import './operated.ts'\n",
      'apps/mobile/src/operated.ts': "const origin = 'https://platform.example'\n",
      'apps/mobile/tests/fixtures/keyless.ts': 'class DevelopmentKeylessMobileHandshakeClient {}\n',
      'apps/platform/src/boot.ts': "import './durable.ts'\n",
      'apps/platform/src/durable.ts': 'class PostgresAccountBackend {}\n',
    })

    expect(collectCompanionProductEntryResidue(root)).toEqual([])
  })

  it('finds no proof-only provider reachable from repository product entries', () => {
    expect(collectCompanionProductEntryResidue(join(import.meta.dirname, '..'))).toEqual([])
  })
})

function fixtureRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-companion-product-entry-'))
  roots.push(root)
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), contents)
  }
  return root
}
