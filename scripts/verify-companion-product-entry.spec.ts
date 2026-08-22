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

  it('resolves bare workspace subpaths imported by every product entry', () => {
    const root = fixtureRoot({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'apps/desktop/src/main.ts': "import { createDesktopStore } from '@fixture/platform/desktop'\nvoid createDesktopStore\n",
      'apps/mobile/src/main.tsx': "import { createMobileStore } from '@fixture/platform/mobile'\nvoid createMobileStore\n",
      'apps/platform/src/boot.ts': "import { createPlatformStore } from '@fixture/platform/server'\nvoid createPlatformStore\n",
      'packages/platform/package.json': JSON.stringify({
        name: '@fixture/platform',
        exports: {
          './desktop': { default: './lib/desktop.js' },
          './mobile': { default: './lib/mobile.js' },
          './server': { default: './lib/server.js' },
        },
      }),
      'packages/platform/src/desktop.ts': 'export function createDesktopStore() { return new MemoryAccountBackend() }\n',
      'packages/platform/src/mobile.ts': 'export function createMobileStore() { return new MemoryRelayStore() }\n',
      'packages/platform/src/server.ts': 'export function createPlatformStore() { return new MemoryPlatformCapacityState() }\n',
    })

    expect(collectCompanionProductEntryResidue(root)).toEqual([
      'packages/platform/src/desktop.ts:1: contains an in-memory product authority.',
      'packages/platform/src/mobile.ts:1: contains an in-memory product authority.',
      'packages/platform/src/server.ts:1: contains an in-memory product authority.',
    ])
  })

  it('finds no proof-only provider reachable from repository product entries', () => {
    expect(collectCompanionProductEntryResidue(join(import.meta.dirname, '..'))).toEqual([])
  })
})

function fixtureRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-companion-product-entry-'))
  roots.push(root)
  if (files['package.json'] === undefined) files['package.json'] = JSON.stringify({ workspaces: [] })
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), contents)
  }
  return root
}
