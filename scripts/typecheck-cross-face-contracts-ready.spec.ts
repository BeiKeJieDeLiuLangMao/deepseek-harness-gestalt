/** Post-generation cross-face integration-test typecheck orchestration. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { POST_GENERATION_CROSS_FACE_TESTS } from './project-reference-faces.ts'
import { createPostGenerationCrossFaceProgram } from './ts-project.ts'
import {
  crossFaceContractDiagnostics,
  crossFaceContractTests,
} from './typecheck-cross-face-contracts-ready.ts'

const roots: string[] = []
const consumer = 'packages/platform/example/tests/cross-face.spec.ts'

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function fixture(source: string, paths: Record<string, string[]> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cross-face-contracts-'))
  roots.push(root)
  writeJson(join(root, 'apps/desktop/tsconfig.json'), {
    compilerOptions: {
      target: 'es2024',
      module: 'esnext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      composite: false,
      incremental: false,
      types: [],
      paths,
    },
    include: ['src', 'tests', 'scripts'],
    references: [],
  })
  for (const [face, type] of [['host', 'string'], ['client', 'number']] as const) {
    const project = `packages/${face}/unrelated`
    writeJson(join(root, project, 'tsconfig.json'), {
      compilerOptions: { composite: true, declaration: true, rootDir: 'src', outDir: 'lib/types' },
      include: ['src'],
    })
    const sourcePath = join(root, project, 'src/index.ts')
    mkdirSync(dirname(sourcePath), { recursive: true })
    writeFileSync(sourcePath, `declare module 'unrelated' { interface Context { collision: ${type} } }\n`)
    writeJson(join(root, `tsconfig.${face}.json`), { references: [{ path: `./${project}` }] })
  }
  const consumerPath = join(root, consumer)
  mkdirSync(dirname(consumerPath), { recursive: true })
  writeFileSync(consumerPath, source)
  return root
}

describe('post-generation cross-face typecheck', () => {
  it('uses the exact shared inventory as the only production Program roots', () => {
    const root = join(import.meta.dirname, '..')
    const tests = crossFaceContractTests(root)
    const program = createPostGenerationCrossFaceProgram(root, tests)

    expect(tests).toEqual(POST_GENERATION_CROSS_FACE_TESTS)
    expect(program.getRootFileNames().map(path => relative(root, path).replaceAll('\\', '/'))).toEqual(tests)
  })

  it('keeps the inventory as the only Program roots without loading unrelated augmentations', () => {
    const root = fixture('export {}\n')
    const program = createPostGenerationCrossFaceProgram(root, [consumer])

    expect(program.getRootFileNames().map(path => relative(root, path).replaceAll('\\', '/'))).toEqual([consumer])
    const sourceFiles = program.getSourceFiles().map(file => relative(root, file.fileName).replaceAll('\\', '/'))
    expect(sourceFiles).not.toContain('packages/host/unrelated/src/index.ts')
    expect(sourceFiles).not.toContain('packages/client/unrelated/src/index.ts')
    expect(program.getSemanticDiagnostics()).toEqual([])
  })

  it('reports a deliberate cross-face test type error', () => {
    const root = fixture('const value: string = 1\nvoid value\n')

    expect(crossFaceContractDiagnostics(root, [consumer]).map(diagnostic => diagnostic.code)).toContain(2322)
  })

  it('reports a missing generated Remote declaration', () => {
    const root = fixture(
      "import type { Remote } from '@fixture/generated/remote'\nvoid (0 as unknown as Remote)\n",
      { '@fixture/generated/remote': ['./missing/remote.d.ts'] },
    )

    expect(crossFaceContractDiagnostics(root, [consumer]).map(diagnostic => diagnostic.code)).toContain(2307)
  })
})
