/** Validate compiler-face isolation across workspace Project Reference graphs. */

import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

export type ProjectFace = 'host' | 'client'

/** A complete application project checked after Host-generated contracts exist. */
export interface PostGenerationApplicationProject {
  readonly config: string
  readonly include: readonly string[]
  readonly script: string
}

/** Application projects checked after generated contracts and both compiler aggregates exist. */
export const POST_GENERATION_APPLICATION_PROJECTS: readonly PostGenerationApplicationProject[] = [
  {
    config: 'apps/desktop/tsconfig.json',
    include: ['src', 'tests', 'scripts'],
    script: 'typecheck:desktop-contracts-ready',
  },
]

export const GESTALT_COMPILER_FACES: Readonly<Record<ProjectFace, readonly string[]>> = {
  host: [
    'apps/platform',
    'packages/browser/browser-runtime',
    'packages/browser/browser-runtime-deterministic',
    'packages/browser/browser-runtime-electron',
    'packages/browser/browser-runtime-tandem',
    'packages/browser/browser-workspace',
    'packages/browser/tool-browser',
    'packages/core/agent-tool-eligibility',
    'packages/core/tools-eligibility',
    'packages/interaction/member-question-receiver',
    'packages/interaction/member-question-sender',
    'packages/interaction/tool-project-members',
    'packages/platform/noise-channel',
    'packages/platform/platform-account',
    'packages/platform/platform-account-core',
    'packages/platform/platform-account-http',
    'packages/platform/project-membership',
    'packages/platform/project-membership-core',
    'packages/platform/project-membership-desktop',
    'packages/platform/project-membership-http',
    'packages/platform/remote-access',
    'packages/platform/remote-access-http',
    'packages/platform/remote-access-redis',
    'packages/platform/remote-attachments',
    'packages/platform/remote-protocol',
  ],
  client: [
    'apps/mobile',
    'packages/client/ui-better-sidebar',
    'packages/client/ui-browser',
    'packages/client/ui-desktop',
    'packages/client/ui-member-questions',
    'packages/client/ui-workbench',
    'packages/platform/platform-account-client',
    'packages/platform/project-membership-client',
    'packages/platform/remote-access-client',
  ],
}

interface ProjectReferenceConfig {
  readonly compilerOptions?: Readonly<Record<string, unknown>>
  readonly extends?: unknown
  readonly include?: readonly unknown[]
  readonly exclude?: readonly unknown[]
  readonly references?: ReadonlyArray<{ readonly path?: unknown }>
}

const WORKSPACE_MANIFESTS = [
  'packages/*/*/package.json',
  'apps/*/package.json',
  'vendor/*/package.json',
] as const

const GESTALT_PROJECT_PATTERNS = [
  'apps/{desktop,mobile,platform}/tsconfig.json',
  'packages/browser/*/tsconfig.json',
  'packages/client/{ui-better-sidebar,ui-browser,ui-desktop,ui-member-questions,ui-workbench}/tsconfig.json',
  'packages/core/{agent-tool-eligibility,tools-eligibility}/tsconfig.json',
  'packages/interaction/{member-question-receiver,member-question-sender,tool-project-members}/tsconfig.json',
  'packages/platform/*/tsconfig.json',
] as const

const GENERATED_CONTRACT_BUILD_SCRIPTS: Readonly<Record<string, string>> = {
  'build:lib': 'npm run build:lib:host && npm run build:lib:client',
  'build:lib:client': 'npm run typecheck:contracts-ready && tsdown --env.DSH_BUILD_FACE client',
  typecheck: 'npm run build:lib:host && npm run typecheck:contracts-ready',
  'typecheck:contracts-ready': 'tsc -b tsconfig.client.json && npm run typecheck:desktop-contracts-ready',
  'typecheck:desktop-contracts-ready': 'tsc -p apps/desktop/tsconfig.json',
}

/**
 * Find references that enter the wrong leaf of a split Host/Client project.
 *
 * A single-config project is neutral and may participate in either graph. Once
 * a package declares both face configs, every reachable reference must name
 * the leaf matching the aggregate from which traversal began.
 *
 * @param root - Repository root containing both aggregate tsconfigs.
 * @returns Repo-relative diagnostics for every mismatched reference edge.
 */
export function collectProjectReferenceFaceViolations(root: string): string[] {
  const splitRoots = splitProjectRoots(root)
  const violations = [
    ...collectGestaltCompilerFaceViolations(root),
    ...collectPostGenerationApplicationViolations(root),
    ...collectWebHostTestFaceViolations(root),
  ]
  const pending = [
    resolve(root, 'tsconfig.host.json'),
    resolve(root, 'tsconfig.client.json'),
    ...POST_GENERATION_APPLICATION_PROJECTS.map(project => resolve(root, project.config)),
  ]
  const visited = new Set<string>()
  for (let configPath = pending.pop(); configPath !== undefined; configPath = pending.pop()) {
    if (visited.has(configPath) || !existsSync(configPath)) continue
    visited.add(configPath)
    const config = projectConfig(root, configPath)
    const face = projectFace(root, configPath, config)
    for (const reference of projectReferences(config)) {
      const targetConfig = referenceConfigPath(configPath, reference)
      const splitRoot = containingSplitRoot(splitRoots, targetConfig)
      if (splitRoot !== undefined) {
        if (face === undefined) {
          violations.push(
            `${repoPath(root, configPath)}: Project Reference ${JSON.stringify(reference)} enters split project ${repoPath(root, splitRoot)} from a config with no Host/Client face`,
          )
          continue
        }
        const expected = resolve(splitRoot, `tsconfig.${face}.json`)
        if (targetConfig !== expected) {
          violations.push(
            `${repoPath(root, configPath)}: Project Reference ${JSON.stringify(reference)} enters split project ${repoPath(root, splitRoot)} from a ${faceLabel(face)} config; reference ${JSON.stringify(repoPath(root, expected))} instead`,
          )
          continue
        }
      }
      pending.push(targetConfig)
    }
  }

  return violations.sort()
}

/**
 * Find application checks that violate generated-contract ordering.
 *
 * @param root - Repository root containing compiler configs and package scripts.
 * @param applications - Application projects checked after both aggregates.
 * @returns Repo-relative diagnostics for misplaced or emitting application checks.
 */
export function collectPostGenerationApplicationViolations(
  root: string,
  applications: readonly PostGenerationApplicationProject[] = POST_GENERATION_APPLICATION_PROJECTS,
): string[] {
  const violations: string[] = []
  const aggregateReferences = new Map<ProjectFace, Set<string>>()
  for (const face of ['host', 'client'] as const) {
    const aggregate = resolve(root, `tsconfig.${face}.json`)
    if (!existsSync(aggregate)) continue
    aggregateReferences.set(face, new Set(
      projectReferences(projectConfig(root, aggregate)).map(reference => referenceConfigPath(aggregate, reference)),
    ))
  }

  for (const application of applications) {
    const configPath = resolve(root, application.config)
    if (!existsSync(configPath)) {
      violations.push(`${application.config}: required post-generation application config is missing`)
      continue
    }
    for (const [face, references] of aggregateReferences) {
      if (references.has(configPath)) {
        violations.push(`${application.config}: post-generation application project must not be referenced by the root ${faceLabel(face)} aggregate`)
      }
    }

    const config = projectConfig(root, configPath)
    if (!sameStringArray(config.include, application.include)) {
      violations.push(`${application.config}: include must be exactly ${JSON.stringify(application.include)} for the post-generation application check`)
    }
    for (const [option, expected] of Object.entries({
      noEmit: true,
      composite: false,
      incremental: false,
      rewriteRelativeImportExtensions: false,
    })) {
      if (config.compilerOptions?.[option] !== expected) {
        violations.push(`${application.config}: compilerOptions.${option} must be ${String(expected)} for the post-generation application check`)
      }
    }
    if (projectReferences(config).length === 0) {
      violations.push(`${application.config}: post-generation application check must retain its Project References`)
    }
  }

  const packagePath = resolve(root, 'package.json')
  if (!existsSync(packagePath)) {
    violations.push('package.json: required generated-contract build scripts are missing')
    return violations.sort()
  }
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as unknown
  const scripts = isRecord(manifest) && isRecord(manifest.scripts) ? manifest.scripts : {}
  for (const [name, expected] of Object.entries(GENERATED_CONTRACT_BUILD_SCRIPTS)) {
    if (scripts[name] !== expected) {
      violations.push(`package.json: script ${JSON.stringify(name)} must be ${JSON.stringify(expected)}`)
    }
  }
  for (const application of applications) {
    if (!(application.script in GENERATED_CONTRACT_BUILD_SCRIPTS)) {
      violations.push(`${application.config}: post-generation script ${JSON.stringify(application.script)} is absent from the generated-contract build order`)
    }
  }
  return violations.sort()
}

/**
 * Find retained Gestalt projects omitted from their required root aggregate.
 *
 * @param root - Repository root containing the compiler aggregates.
 * @returns Repo-relative diagnostics for every missing Gestalt compiler face.
 */
export function collectGestaltCompilerFaceViolations(
  root: string,
  inventory: Readonly<Record<ProjectFace, readonly string[]>> = GESTALT_COMPILER_FACES,
): string[] {
  const violations: string[] = []
  const discovered = discoverGestaltCompilerFaces(root)
  for (const face of ['host', 'client'] as const) {
    const aggregate = resolve(root, `tsconfig.${face}.json`)
    const references = new Set(projectReferences(projectConfig(root, aggregate))
      .map(reference => referenceConfigPath(aggregate, reference)))
    const declared = new Set(inventory[face])
    for (const directory of discovered[face]) {
      if (!declared.has(directory)) {
        violations.push(`${directory}/tsconfig.json: retained Gestalt ${faceLabel(face)} project is omitted from GESTALT_COMPILER_FACES`)
      }
    }
    for (const directory of declared) {
      const expected = resolve(root, directory, 'tsconfig.json')
      if (!existsSync(expected)) continue
      if (!discovered[face].has(directory)) {
        violations.push(`${directory}/tsconfig.json: GESTALT_COMPILER_FACES classifies a project not discovered as ${faceLabel(face)}`)
      }
      if (!references.has(expected)) {
        violations.push(`${directory}/tsconfig.json: retained Gestalt project is omitted from the root ${faceLabel(face)} aggregate`)
      }
    }
  }
  return violations.sort()
}

/**
 * Find Web tests whose direct scaffold dependency is missing from either compiler face.
 *
 * @param root - Repository root containing the Web tests and aggregate tsconfigs.
 * @returns Repo-relative diagnostics for missing or stale exact Web test entries.
 */
export function collectWebHostTestFaceViolations(root: string): string[] {
  const webConfigPath = resolve(root, 'apps/web/tsconfig.json')
  const hostConfigPath = resolve(root, 'tsconfig.host.json')
  const violations: string[] = []
  if (!existsSync(webConfigPath)) {
    violations.push('apps/web/tsconfig.json: required Web Host-test compiler-face config is missing')
  }
  if (!existsSync(hostConfigPath)) {
    violations.push('tsconfig.host.json: required Web Host-test compiler-face config is missing')
  }
  if (violations.length > 0) return violations

  const webConfig = projectConfig(root, webConfigPath)
  const hostConfig = projectConfig(root, hostConfigPath)
  const webExcludes = stringEntries(webConfig.exclude)
  const hostIncludes = stringEntries(hostConfig.include)
  const scaffoldConsumers = discoverDirectScaffoldConsumers(root)

  if (scaffoldConsumers.size === 0) {
    violations.push('apps/web/tests: no static direct ./scaffold.ts imports discovered; Web Host-test compiler-face validation requires a non-empty corpus')
  }

  for (const consumer of scaffoldConsumers) {
    const webEntry = consumer.slice('apps/web/'.length)
    if (!webExcludes.has(webEntry)) {
      violations.push(`apps/web/tsconfig.json: ${consumer} statically imports "./scaffold.ts" and must be listed exactly as ${JSON.stringify(webEntry)} in exclude`)
    }
    if (!hostIncludes.has(consumer)) {
      violations.push(`tsconfig.host.json: ${consumer} statically imports "./scaffold.ts" and must be listed exactly in include`)
    }
  }

  collectStaleWebTestEntries(root, 'apps/web/tsconfig.json', webExcludes, 'tests/', violations)
  collectStaleWebTestEntries(root, 'tsconfig.host.json', hostIncludes, 'apps/web/tests/', violations)
  return violations.sort()
}

function discoverDirectScaffoldConsumers(root: string): Set<string> {
  const consumers = new Set<string>()
  for (const relativePath of globSync('apps/web/tests/*.{ts,tsx}', { cwd: root })) {
    const absolutePath = resolve(root, relativePath)
    if (statSync(absolutePath, { throwIfNoEntry: false })?.isFile() !== true) continue
    const normalizedPath = normalizePath(relativePath)
    const sourceText = readFileSync(absolutePath, 'utf8')
    const scriptKind = relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(normalizedPath, sourceText, ts.ScriptTarget.Latest, true, scriptKind)
    if (sourceFile.statements.some(statement => isStaticScaffoldImport(statement))) {
      consumers.add(normalizedPath)
    }
  }
  return consumers
}

function isStaticScaffoldImport(statement: ts.Statement): boolean {
  return ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === './scaffold.ts'
}

function collectStaleWebTestEntries(
  root: string,
  configPath: string,
  entries: ReadonlySet<string>,
  prefix: string,
  violations: string[],
): void {
  for (const entry of entries) {
    if (!isExactWebTestFileEntry(entry, prefix)) continue
    const repoRelative = configPath === 'apps/web/tsconfig.json' ? `apps/web/${entry}` : entry
    if (statSync(resolve(root, repoRelative), { throwIfNoEntry: false })?.isFile() !== true) {
      violations.push(`${configPath}: stale exact Web test entry ${JSON.stringify(normalizePath(entry))} is not a file`)
    }
  }
}

function isExactWebTestFileEntry(entry: string, prefix: string): boolean {
  if (!entry.startsWith(prefix) || entry.slice(prefix.length).includes('/')) return false
  if (/[?*{}[\]]/.test(entry)) return false
  return /\.(?:e2e|snapshot|acceptance|perf|spec|test)\.(?:ts|tsx)$/.test(entry)
}

function stringEntries(values: readonly unknown[] | undefined): Set<string> {
  return new Set((values ?? []).filter((value): value is string => typeof value === 'string').map(normalizePath))
}

function sameStringArray(actual: readonly unknown[] | undefined, expected: readonly string[]): boolean {
  return actual?.length === expected.length && actual.every((value, index) => value === expected[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}

function discoverGestaltCompilerFaces(root: string): Record<ProjectFace, Set<string>> {
  const discovered: Record<ProjectFace, Set<string>> = { host: new Set(), client: new Set() }
  for (const config of globSync(GESTALT_PROJECT_PATTERNS, { cwd: root })) {
    const configPath = resolve(root, config)
    if (POST_GENERATION_APPLICATION_PROJECTS.some(project => resolve(root, project.config) === configPath)) continue
    const face = projectFace(root, configPath, projectConfig(root, configPath))
    if (face === undefined) {
      throw new Error(`${repoPath(root, configPath)}: retained Gestalt project has no Host/Client face`)
    }
    discovered[face].add(repoPath(root, dirname(configPath)))
  }
  return discovered
}

function splitProjectRoots(root: string): string[] {
  return globSync(WORKSPACE_MANIFESTS, { cwd: root })
    .map(manifest => resolve(root, dirname(manifest)))
    .filter(dir => existsSync(resolve(dir, 'tsconfig.host.json'))
      && existsSync(resolve(dir, 'tsconfig.client.json')))
    .sort((left, right) => right.length - left.length)
}

function projectConfig(root: string, configPath: string): ProjectReferenceConfig {
  const read = ts.readConfigFile(configPath, path => ts.sys.readFile(path))
  if (read.error !== undefined) {
    const message = ts.flattenDiagnosticMessageText(read.error.messageText, '\n')
    throw new Error(`${repoPath(root, configPath)}: ${message}`)
  }
  return read.config as ProjectReferenceConfig
}

function projectReferences(config: ProjectReferenceConfig): string[] {
  return (config.references ?? [])
    .map(reference => reference.path)
    .filter((path): path is string => typeof path === 'string')
}

function projectFace(
  root: string,
  configPath: string,
  config: ProjectReferenceConfig,
  seen = new Set<string>(),
): ProjectFace | undefined {
  if (basename(configPath) === 'tsconfig.host.json') return 'host'
  if (basename(configPath) === 'tsconfig.client.json') return 'client'
  if (configPath === resolve(root, 'tsconfig.base.json')) return 'host'
  if (configPath === resolve(root, 'tsconfig.base.client.json')) return 'client'
  if (seen.has(configPath)) return undefined
  seen.add(configPath)
  const parent = localExtendsConfig(configPath, config.extends)
  if (parent === undefined || !existsSync(parent)) return undefined
  return projectFace(root, parent, projectConfig(root, parent), seen)
}

function localExtendsConfig(configPath: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('.')) return undefined
  const target = resolve(dirname(configPath), value)
  return target.endsWith('.json') ? target : `${target}.json`
}

function referenceConfigPath(sourceConfig: string, reference: string): string {
  const target = resolve(dirname(sourceConfig), reference)
  return target.endsWith('.json') ? target : resolve(target, 'tsconfig.json')
}

function containingSplitRoot(splitRoots: readonly string[], targetConfig: string): string | undefined {
  return splitRoots.find((root) => {
    const path = relative(root, targetConfig)
    return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
  })
}

function repoPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

function faceLabel(face: ProjectFace): string {
  return face === 'host' ? 'Host' : 'Client'
}
