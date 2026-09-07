import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectGestaltCompilerFaceViolations,
  collectPostGenerationApplicationViolations,
  collectProjectReferenceFaceViolations,
  collectWebHostTestFaceViolations,
  POST_GENERATION_APPLICATION_PROJECTS,
  POST_GENERATION_CROSS_FACE_TESTS,
} from './project-reference-faces.ts'

const roots: string[] = []
const desktopApplication = POST_GENERATION_APPLICATION_PROJECTS[0]
if (desktopApplication === undefined) throw new Error('Desktop post-generation application inventory is missing')
const crossFaceTests = [...POST_GENERATION_CROSS_FACE_TESTS]

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function generatedContractBuildScripts(): Record<string, string> {
  return {
    'build:lib': 'npm run build:lib:host && npm run build:lib:client',
    'build:lib:client': 'npm run typecheck:contracts-ready && tsdown --env.DSH_BUILD_FACE client',
    typecheck: 'npm run build:lib:host && npm run typecheck:contracts-ready',
    'typecheck:contracts-ready': 'tsc -b tsconfig.client.json && npm run typecheck:desktop-contracts-ready && npm run typecheck:cross-face-contracts-ready',
    'typecheck:cross-face-contracts-ready': 'tsx scripts/typecheck-cross-face-contracts-ready.ts',
    'typecheck:desktop-contracts-ready': 'tsc -p apps/desktop/tsconfig.json',
  }
}

function writePostGenerationDesktop(
  root: string,
  overrides: Record<string, unknown> = {},
): void {
  mkdirSync(join(root, 'apps/desktop/src'), { recursive: true })
  mkdirSync(join(root, 'apps/desktop/tests'), { recursive: true })
  mkdirSync(join(root, 'apps/desktop/scripts'), { recursive: true })
  writeFileSync(join(root, 'apps/desktop/src/main.ts'), 'export {}\n')
  writeFileSync(join(root, 'apps/desktop/tests/main.spec.ts'), 'export {}\n')
  writeFileSync(join(root, 'apps/desktop/scripts/build.mjs'), 'export {}\n')
  for (const test of crossFaceTests) {
    const path = join(root, test)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'export {}\n')
  }
  writeJson(join(root, 'apps/desktop/tsconfig.json'), {
    compilerOptions: {
      noEmit: true,
      composite: false,
      incremental: false,
      rewriteRelativeImportExtensions: false,
    },
    include: ['src', 'tests', 'scripts'],
    references: [{ path: '../../packages/core/shared' }],
    ...overrides,
  })
}

function postGenerationApplicationFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-project-reference-faces-'))
  roots.push(root)
  mkdirSync(join(root, 'packages/core/shared'), { recursive: true })
  writeJson(join(root, 'packages/core/shared/tsconfig.json'), { compilerOptions: { composite: true } })
  writeJson(join(root, 'tsconfig.host.json'), {
    exclude: crossFaceTests,
    references: [],
  })
  writeJson(join(root, 'tsconfig.client.json'), { references: [] })
  writeJson(join(root, 'package.json'), { scripts: generatedContractBuildScripts() })
  writePostGenerationDesktop(root)
  return root
}

function webHostTestFixture(options: {
  readonly source?: string
  readonly webExclude?: readonly string[]
  readonly hostInclude?: readonly string[]
} = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-project-reference-faces-'))
  roots.push(root)
  mkdirSync(join(root, 'apps/web/tests'), { recursive: true })
  writeFileSync(
    join(root, 'apps/web/tests/example.e2e.ts'),
    options.source ?? "import { launchWebScaffold } from './scaffold.ts'\nvoid launchWebScaffold\n",
  )
  writeFileSync(join(root, 'apps/web/tests/scaffold.ts'), 'export const launchWebScaffold = 1\n')
  writeJson(join(root, 'apps/web/tsconfig.json'), {
    exclude: options.webExclude ?? ['tests/example.e2e.ts'],
  })
  writeJson(join(root, 'tsconfig.host.json'), {
    include: options.hostInclude ?? ['apps/web/tests/example.e2e.ts'],
  })
  return root
}

function workspaceFixture(options: {
  readonly host: readonly string[]
  readonly client: readonly string[]
}): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-project-reference-faces-'))
  roots.push(root)
  const shared = join(root, 'packages/core/shared')
  const split = join(root, 'packages/api/split')
  mkdirSync(shared, { recursive: true })
  mkdirSync(split, { recursive: true })
  mkdirSync(join(root, 'apps/web/tests'), { recursive: true })
  writeFileSync(join(root, 'apps/web/tests/example.e2e.ts'), "import './scaffold.ts'\n")
  writeFileSync(join(root, 'apps/web/tests/scaffold.ts'), 'export {}\n')
  writeJson(join(root, 'apps/web/tsconfig.json'), { exclude: ['tests/example.e2e.ts'] })
  writeJson(join(root, 'tsconfig.base.json'), {})
  writeJson(join(root, 'tsconfig.base.client.json'), { extends: './tsconfig.base.json' })
  writeJson(join(shared, 'package.json'), { name: '@deepseek-ai/dsh-shared' })
  writeJson(join(shared, 'tsconfig.json'), {
    extends: '../../../tsconfig.base.json',
    references: [],
  })
  writeJson(join(split, 'package.json'), { name: '@deepseek-ai/dsh-split' })
  writeJson(join(split, 'tsconfig.json'), {
    files: [],
    references: [{ path: './tsconfig.host.json' }, { path: './tsconfig.client.json' }],
  })
  writeJson(join(split, 'tsconfig.host.json'), { references: [{ path: '../../core/shared' }] })
  writeJson(join(split, 'tsconfig.client.json'), { references: [{ path: '../../core/shared' }] })
  writeJson(join(root, 'tsconfig.host.json'), {
    exclude: crossFaceTests,
    include: ['apps/web/tests/example.e2e.ts'],
    references: options.host.map(path => ({ path })),
  })
  writeJson(join(root, 'tsconfig.client.json'), {
    references: options.client.map(path => ({ path })),
  })
  writeJson(join(root, 'package.json'), { scripts: generatedContractBuildScripts() })
  writePostGenerationDesktop(root)
  return root
}

describe('Project Reference compiler faces', () => {
  it('accepts the production compiler-face configuration', () => {
    expect(collectProjectReferenceFaceViolations(join(import.meta.dirname, '..'))).toEqual([])
  })

  it('keeps representative Desktop inputs in the parsed no-emit application check', () => {
    const root = join(import.meta.dirname, '..')
    const configPath = join(root, 'apps/desktop/tsconfig.json')
    const read = ts.readConfigFile(configPath, path => ts.sys.readFile(path))
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath), undefined, configPath)
    const inputs = parsed.fileNames.map(path => relative(root, path).replaceAll('\\', '/'))

    expect(inputs).toEqual(expect.arrayContaining([
      'apps/desktop/src/app-icon.ts',
      'apps/desktop/tests/app-icon.spec.ts',
      'apps/desktop/scripts/build-main.mjs',
    ]))
    expect(parsed.options).toMatchObject({
      noEmit: true,
      composite: false,
      incremental: false,
      rewriteRelativeImportExtensions: false,
    })
  })

  it('accepts a complete post-generation application contract', () => {
    expect(collectPostGenerationApplicationViolations(postGenerationApplicationFixture())).toEqual([])
  })

  it('rejects a post-generation application in either root aggregate', () => {
    const root = postGenerationApplicationFixture()
    writeJson(join(root, 'tsconfig.host.json'), {
      exclude: crossFaceTests,
      references: [{ path: './apps/desktop' }],
    })
    writeJson(join(root, 'tsconfig.client.json'), { references: [{ path: './apps/desktop' }] })

    expect(collectPostGenerationApplicationViolations(root)).toEqual([
      'apps/desktop/tsconfig.json: post-generation application project must not be referenced by the root Client aggregate',
      'apps/desktop/tsconfig.json: post-generation application project must not be referenced by the root Host aggregate',
    ])
  })

  it('rejects narrowed inputs and emitting post-generation application settings', () => {
    const root = postGenerationApplicationFixture()
    writePostGenerationDesktop(root, {
      compilerOptions: {
        noEmit: false,
        composite: true,
        incremental: true,
        rewriteRelativeImportExtensions: true,
      },
      include: ['src', 'scripts'],
      references: [],
    })

    expect(collectPostGenerationApplicationViolations(root)).toEqual([
      'apps/desktop/tsconfig.json: compilerOptions.composite must be false for the post-generation application check',
      'apps/desktop/tsconfig.json: compilerOptions.incremental must be false for the post-generation application check',
      'apps/desktop/tsconfig.json: compilerOptions.noEmit must be true for the post-generation application check',
      'apps/desktop/tsconfig.json: compilerOptions.rewriteRelativeImportExtensions must be false for the post-generation application check',
      'apps/desktop/tsconfig.json: include must be exactly ["src","tests","scripts"] for the post-generation application check',
      'apps/desktop/tsconfig.json: post-generation application check must retain its Project References',
    ])
  })

  it('rejects a missing post-generation cross-face test', () => {
    const root = postGenerationApplicationFixture()
    const test = crossFaceTests[0]
    if (test === undefined) throw new Error('Post-generation cross-face test inventory is empty')
    rmSync(join(root, test))

    expect(collectPostGenerationApplicationViolations(root)).toEqual([
      `POST_GENERATION_CROSS_FACE_TESTS: ${JSON.stringify(test)} is not a file`,
    ])
  })

  it('requires an exact Host exclusion for every post-generation cross-face test', () => {
    const root = postGenerationApplicationFixture()
    const [test, ...remaining] = crossFaceTests
    if (test === undefined) throw new Error('Post-generation cross-face test inventory is empty')
    writeJson(join(root, 'tsconfig.host.json'), {
      exclude: [...remaining, 'packages/platform/**'],
      references: [],
    })

    expect(collectPostGenerationApplicationViolations(root)).toEqual([
      `tsconfig.host.json: post-generation cross-face test ${JSON.stringify(test)} must be excluded exactly`,
    ])
  })

  it('rejects an empty or duplicate post-generation cross-face test inventory', () => {
    const root = postGenerationApplicationFixture()
    const test = crossFaceTests[0]
    if (test === undefined) throw new Error('Post-generation cross-face test inventory is empty')

    expect(collectPostGenerationApplicationViolations(root, POST_GENERATION_APPLICATION_PROJECTS, []))
      .toContain('POST_GENERATION_CROSS_FACE_TESTS: inventory must not be empty')
    expect(collectPostGenerationApplicationViolations(
      root,
      POST_GENERATION_APPLICATION_PROJECTS,
      [...crossFaceTests, test],
    )).toContain(`POST_GENERATION_CROSS_FACE_TESTS: duplicate entry ${JSON.stringify(test)}`)
  })

  it('rejects a stale exact post-generation cross-face test exclusion', () => {
    const root = postGenerationApplicationFixture()
    const [stale, ...current] = crossFaceTests
    if (stale === undefined) throw new Error('Post-generation cross-face test inventory is empty')

    expect(collectPostGenerationApplicationViolations(
      root,
      POST_GENERATION_APPLICATION_PROJECTS,
      current,
    )).toEqual([
      `tsconfig.host.json: stale post-generation cross-face test exclusion ${JSON.stringify(stale)} is absent from POST_GENERATION_CROSS_FACE_TESTS`,
    ])
  })

  it('rejects scripts that check Desktop before generated contracts and the Client aggregate', () => {
    const root = postGenerationApplicationFixture()
    writeJson(join(root, 'package.json'), {
      scripts: {
        ...generatedContractBuildScripts(),
        'build:lib': 'npm run build:lib:client && npm run build:lib:host',
        'build:lib:client': 'tsc -b tsconfig.client.json && tsdown --env.DSH_BUILD_FACE client',
        'typecheck:contracts-ready': 'npm run typecheck:desktop-contracts-ready && tsc -b tsconfig.client.json',
      },
    })

    expect(collectPostGenerationApplicationViolations(root)).toEqual([
      'package.json: script "build:lib" must be "npm run build:lib:host && npm run build:lib:client"',
      'package.json: script "build:lib:client" must be "npm run typecheck:contracts-ready && tsdown --env.DSH_BUILD_FACE client"',
      'package.json: script "typecheck:contracts-ready" must be "tsc -b tsconfig.client.json && npm run typecheck:desktop-contracts-ready && npm run typecheck:cross-face-contracts-ready"',
    ])
  })

  it('returns nonzero for a deliberate Desktop test type error', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-typecheck-'))
    roots.push(root)
    mkdirSync(join(root, 'apps/desktop/src'), { recursive: true })
    mkdirSync(join(root, 'apps/desktop/tests'), { recursive: true })
    mkdirSync(join(root, 'apps/desktop/scripts'), { recursive: true })
    writeFileSync(join(root, 'apps/desktop/src/main.ts'), 'export {}\n')
    writeFileSync(join(root, 'apps/desktop/tests/invalid.spec.ts'), 'const value: string = 1\nvoid value\n')
    writeFileSync(join(root, 'apps/desktop/scripts/build.mjs'), 'export {}\n')
    writeJson(join(root, 'apps/desktop/tsconfig.json'), {
      compilerOptions: { allowJs: true, noEmit: true, strict: true },
      include: ['src', 'tests', 'scripts'],
    })
    const tsc = join(import.meta.dirname, '../node_modules/typescript/bin/tsc')

    const result = spawnSync(process.execPath, [tsc, '-p', 'apps/desktop/tsconfig.json'], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`.replaceAll('\\', '/')).toContain('apps/desktop/tests/invalid.spec.ts')
  })

  it('discovers a static direct scaffold import', () => {
    const root = webHostTestFixture({
      source: "import scaffold, { type WebScaffold } from './scaffold.ts'\nvoid scaffold\nvoid (0 as unknown as WebScaffold)\n",
    })

    expect(collectWebHostTestFaceViolations(root)).toEqual([])
  })

  it('rejects a missing Web compiler config', () => {
    const root = webHostTestFixture()
    rmSync(join(root, 'apps/web/tsconfig.json'))

    expect(collectWebHostTestFaceViolations(root)).toEqual([
      'apps/web/tsconfig.json: required Web Host-test compiler-face config is missing',
    ])
  })

  it('rejects a missing Host compiler config', () => {
    const root = webHostTestFixture()
    rmSync(join(root, 'tsconfig.host.json'))

    expect(collectWebHostTestFaceViolations(root)).toEqual([
      'tsconfig.host.json: required Web Host-test compiler-face config is missing',
    ])
  })

  it('reports both missing compiler configs in repo-relative order', () => {
    const root = webHostTestFixture()
    rmSync(join(root, 'apps/web/tsconfig.json'))
    rmSync(join(root, 'tsconfig.host.json'))

    expect(collectWebHostTestFaceViolations(root)).toEqual([
      'apps/web/tsconfig.json: required Web Host-test compiler-face config is missing',
      'tsconfig.host.json: required Web Host-test compiler-face config is missing',
    ])
  })

  it('rejects a scaffold consumer missing from the Web exclusion', () => {
    const root = webHostTestFixture({ webExclude: [] })

    expect(collectWebHostTestFaceViolations(root)).toEqual([
      'apps/web/tsconfig.json: apps/web/tests/example.e2e.ts statically imports "./scaffold.ts" and must be listed exactly as "tests/example.e2e.ts" in exclude',
    ])
  })

  it('rejects a scaffold consumer missing from the Host include', () => {
    const root = webHostTestFixture({ hostInclude: [] })

    expect(collectWebHostTestFaceViolations(root)).toEqual([
      'tsconfig.host.json: apps/web/tests/example.e2e.ts statically imports "./scaffold.ts" and must be listed exactly in include',
    ])
  })

  it('rejects stale exact Web test entries but ignores helpers and globs', () => {
    const root = webHostTestFixture({
      webExclude: [
        'tests/example.e2e.ts',
        'tests/missing.e2e.ts',
        'tests/support.ts',
        'tests/*.snapshot.ts',
      ],
      hostInclude: [
        'apps/web/tests/example.e2e.ts',
        'apps/web/tests/missing.snapshot.ts',
        'apps/web/tests/support.ts',
        'apps/web/tests/**/*.ts',
      ],
    })

    expect(collectWebHostTestFaceViolations(root)).toEqual([
      'apps/web/tsconfig.json: stale exact Web test entry "tests/missing.e2e.ts" is not a file',
      'tsconfig.host.json: stale exact Web test entry "apps/web/tests/missing.snapshot.ts" is not a file',
    ])
  })

  it('rejects a directory at an exact Web test path without reading it', () => {
    const root = webHostTestFixture({
      webExclude: ['tests/example.e2e.ts', 'tests/directory.e2e.ts'],
      hostInclude: ['apps/web/tests/example.e2e.ts', 'apps/web/tests/directory.e2e.ts'],
    })
    mkdirSync(join(root, 'apps/web/tests/directory.e2e.ts'))

    expect(collectWebHostTestFaceViolations(root)).toEqual([
      'apps/web/tsconfig.json: stale exact Web test entry "tests/directory.e2e.ts" is not a file',
      'tsconfig.host.json: stale exact Web test entry "apps/web/tests/directory.e2e.ts" is not a file',
    ])
  })

  it('rejects an empty scaffold discovery corpus', () => {
    const root = webHostTestFixture({ source: "const path = './scaffold.ts'\nvoid path\n" })

    expect(collectWebHostTestFaceViolations(root)).toEqual([
      'apps/web/tests: no static direct ./scaffold.ts imports discovered; Web Host-test compiler-face validation requires a non-empty corpus',
    ])
  })

  it('allows neutral projects in either graph and matching split leaves', () => {
    const root = workspaceFixture({
      host: ['./packages/core/shared', './packages/api/split/tsconfig.host.json'],
      client: ['./packages/core/shared', './packages/api/split/tsconfig.client.json'],
    })

    expect(collectProjectReferenceFaceViolations(root)).toEqual([])
  })

  it('rejects a declared Gestalt project omitted from its compiler face', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-project-reference-faces-'))
    roots.push(root)
    mkdirSync(join(root, 'apps/platform'), { recursive: true })
    writeJson(join(root, 'apps/platform/tsconfig.json'), { extends: '../../tsconfig.base.json' })
    writeJson(join(root, 'tsconfig.base.json'), {})
    writeJson(join(root, 'tsconfig.base.client.json'), {})
    writeJson(join(root, 'tsconfig.host.json'), { references: [] })
    writeJson(join(root, 'tsconfig.client.json'), { references: [] })

    expect(collectGestaltCompilerFaceViolations(root, {
      host: ['apps/platform'],
      client: [],
    })).toEqual([
      'apps/platform/tsconfig.json: retained Gestalt project is omitted from the root Host aggregate',
    ])
  })

  it('rejects apps/platform when both the aggregate and inventory omit it', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-project-reference-faces-'))
    roots.push(root)
    mkdirSync(join(root, 'apps/platform'), { recursive: true })
    writeJson(join(root, 'apps/platform/tsconfig.json'), { extends: '../../tsconfig.base.json' })
    writeJson(join(root, 'tsconfig.base.json'), {})
    writeJson(join(root, 'tsconfig.base.client.json'), {})
    writeJson(join(root, 'tsconfig.host.json'), { references: [] })
    writeJson(join(root, 'tsconfig.client.json'), { references: [] })

    expect(collectGestaltCompilerFaceViolations(root, { host: [], client: [] })).toEqual([
      'apps/platform/tsconfig.json: retained Gestalt Host project is omitted from GESTALT_COMPILER_FACES',
    ])
  })

  it('rejects the opposite leaf and the solution root of a split project', () => {
    const root = workspaceFixture({
      host: [
        './packages/api/split/tsconfig.host.json',
        './packages/api/split/tsconfig.client.json',
      ],
      client: ['./packages/api/split'],
    })

    expect(collectProjectReferenceFaceViolations(root)).toEqual([
      'tsconfig.client.json: Project Reference "./packages/api/split" enters split project packages/api/split from a Client config; reference "packages/api/split/tsconfig.client.json" instead',
      'tsconfig.host.json: Project Reference "./packages/api/split/tsconfig.client.json" enters split project packages/api/split from a Host config; reference "packages/api/split/tsconfig.host.json" instead',
    ])
  })

  it('uses the referencing project face throughout the reachable graph', () => {
    const root = workspaceFixture({
      host: ['./packages/core/host-consumer'],
      client: ['./packages/core/client-consumer'],
    })
    const hostConsumer = join(root, 'packages/core/host-consumer')
    mkdirSync(hostConsumer, { recursive: true })
    writeJson(join(hostConsumer, 'package.json'), { name: '@deepseek-ai/dsh-host-consumer' })
    writeJson(join(hostConsumer, 'tsconfig.json'), {
      extends: '../../../tsconfig.base.json',
      references: [{ path: '../../api/split/tsconfig.client.json' }],
    })
    const clientConsumer = join(root, 'packages/core/client-consumer')
    mkdirSync(clientConsumer, { recursive: true })
    writeJson(join(clientConsumer, 'package.json'), { name: '@deepseek-ai/dsh-client-consumer' })
    writeJson(join(clientConsumer, 'tsconfig.json'), {
      extends: '../../../tsconfig.base.client.json',
      references: [{ path: '../../api/split/tsconfig.host.json' }],
    })

    expect(collectProjectReferenceFaceViolations(root)).toEqual([
      'packages/core/client-consumer/tsconfig.json: Project Reference "../../api/split/tsconfig.host.json" enters split project packages/api/split from a Client config; reference "packages/api/split/tsconfig.client.json" instead',
      'packages/core/host-consumer/tsconfig.json: Project Reference "../../api/split/tsconfig.client.json" enters split project packages/api/split from a Host config; reference "packages/api/split/tsconfig.host.json" instead',
    ])
  })
})
