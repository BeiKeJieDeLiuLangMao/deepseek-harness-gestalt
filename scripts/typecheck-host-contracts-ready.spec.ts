/** Host generated-contract consumer typecheck orchestration. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HOST_CONTRACT_CONSUMER_GLOB,
  hostContractConsumerDiagnostics,
  hostContractConsumerTests,
} from './typecheck-host-contracts-ready.ts'

const roots: string[] = []
const generatedTest = 'packages/api/example/tests/remote.generated.host.spec.ts'
const ordinaryTest = 'packages/api/example/tests/remote.spec.ts'
const clientTest = 'packages/api/example/tests/remote.client.spec.ts'
const hostExcludes = [
  HOST_CONTRACT_CONSUMER_GLOB,
  'packages/*/*/tests/**/*.client.ts',
  'packages/*/*/tests/**/*.client.tsx',
  'packages/*/*/tests/**/*.client.spec.ts',
  'packages/*/*/tests/**/*.client.spec.tsx',
]

function fixture(options: {
  readonly test?: string
  readonly ordinaryTest?: string
  readonly clientTest?: string
  readonly declaration?: string
  readonly exclude?: readonly string[]
} = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-host-contracts-ready-'))
  roots.push(root)
  writeFileSync(join(root, 'tsconfig.host.json'), JSON.stringify({
    compilerOptions: {
      target: 'es2024',
      module: 'esnext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      types: [],
      paths: {
        '@deepseek-ai/dsh-example/remote': ['./packages/api/example/lib/remote.d.ts'],
      },
    },
    include: ['packages/**/*.ts'],
    exclude: options.exclude ?? hostExcludes,
    references: [],
  }, null, 2))
  if (options.test !== undefined) {
    const path = join(root, generatedTest)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, options.test)
  }
  const ordinaryPath = join(root, ordinaryTest)
  mkdirSync(dirname(ordinaryPath), { recursive: true })
  writeFileSync(ordinaryPath, options.ordinaryTest ?? 'export {}\n')
  if (options.clientTest !== undefined) {
    const path = join(root, clientTest)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, options.clientTest)
  }
  if (options.declaration !== undefined) {
    const path = join(root, 'packages/api/example/lib/remote.d.ts')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, options.declaration)
  }
  return root
}

const consumer = 'import type { Remote } from \'@deepseek-ai/dsh-example/remote\'\n'
  + 'const remote: Remote = { value: \'ok\' }\n'
  + 'void remote\n'

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Host generated-contract consumer typecheck', () => {
  it('rejects an empty generated-contract test selection', () => {
    expect(() => hostContractConsumerTests(fixture()))
      .toThrow(`no Host contract consumers matched ${HOST_CONTRACT_CONSUMER_GLOB}`)
  })

  it('rejects a generated Remote consumer without the generated-test suffix', () => {
    const root = fixture()
    const path = join(root, 'packages/api/example/tests/remote.host.spec.ts')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, consumer)
    expect(() => hostContractConsumerTests(root))
      .toThrow('must end in .generated.host.spec.ts')
  })

  it('rejects an ordinary Host spec that imports a generated Remote declaration', () => {
    expect(() => hostContractConsumerTests(fixture({ ordinaryTest: consumer })))
      .toThrow(ordinaryTest)
  })

  it('accepts an ordinary Host spec without a generated Remote import', () => {
    const root = fixture({ test: consumer })
    expect(hostContractConsumerTests(root)).toEqual([generatedTest])
  })

  it('ignores a generated Remote import excluded from the Host aggregate', () => {
    const root = fixture({ test: consumer, clientTest: consumer })
    expect(hostContractConsumerTests(root)).toEqual([generatedTest])
  })

  it('requires the matching Host aggregate exclusion', () => {
    expect(() => hostContractConsumerTests(fixture({ test: consumer, exclude: [] })))
      .toThrow(`tsconfig.host.json must exclude ${JSON.stringify(HOST_CONTRACT_CONSUMER_GLOB)}`)
  })

  it('reports a missing generated Remote declaration', () => {
    const root = fixture({ test: consumer })
    const diagnostics = hostContractConsumerDiagnostics(root, hostContractConsumerTests(root))
    expect(diagnostics.map(diagnostic => diagnostic.code)).toContain(2307)
  })

  it('reports an invalid generated Remote declaration', () => {
    const root = fixture({
      test: consumer,
      declaration: 'export interface Remote { value: number }\n',
    })
    const diagnostics = hostContractConsumerDiagnostics(root, hostContractConsumerTests(root))
    expect(diagnostics.map(diagnostic => diagnostic.code)).toContain(2322)
  })

  it('accepts a valid generated Remote declaration', () => {
    const root = fixture({
      test: consumer,
      declaration: 'export interface Remote { value: string }\n',
    })
    expect(hostContractConsumerDiagnostics(root, hostContractConsumerTests(root))).toEqual([])
  })
})
