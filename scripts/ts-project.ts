/**
 * Shared TypeScript Program construction for repository gates that need real
 * cross-file symbols and types instead of isolated syntax trees.
 */

import { relative, resolve } from 'node:path'
import ts from 'typescript'

interface ProjectGraph {
  rootNames: string[]
  options: ts.CompilerOptions
}

/**
 * A compiler face: the two aggregates a repository-wide program may seed from.
 * The root solution is never one of them.
 */
export type CompilerFace = 'host' | 'client'

/** TypeScript config host shared by repository scripts. */
export const repositoryConfigHost: ts.ParseConfigFileHost = {
  useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  readDirectory: (...args) => ts.sys.readDirectory(...args),
  fileExists: fileName => ts.sys.fileExists(fileName),
  readFile: fileName => ts.sys.readFile(fileName),
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  onUnRecoverableConfigFileDiagnostic(diagnostic) {
    throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
  },
}

/**
 * Parse one face aggregate tsconfig and flatten all referenced projects into one
 * semantic graph. Never seed the root solution: flattening host+client into one
 * program collides the cordis Context merges.
 */
function loadProjectGraph(projectRoot: string, face: CompilerFace): ProjectGraph {
  const rootConfigPath = resolve(projectRoot, `tsconfig.${face}.json`)
  const rootConfig = parseConfig(rootConfigPath)
  const rootNames = new Set<string>()
  const visited = new Set<string>()

  const collect = (configPath: string, parsed: ts.ParsedCommandLine): void => {
    if (visited.has(configPath)) return
    visited.add(configPath)
    for (const fileName of parsed.fileNames) rootNames.add(fileName)
    for (const reference of parsed.projectReferences ?? []) {
      const referencePath = ts.resolveProjectReferencePath(reference)
      collect(referencePath, parseConfig(referencePath))
    }
  }
  collect(rootConfigPath, rootConfig)

  return {
    rootNames: [...rootNames],
    options: rootConfig.options,
  }
}

/** Parse one config file and fail loud on any config diagnostic. */
function parseConfig(configPath: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, repositoryConfigHost)
  if (!parsed) throw new Error(`cannot parse TypeScript config ${configPath}`)
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  }
  return parsed
}

/** Disable emit-only options after loading the root solution config. */
function semanticCompilerOptions(options: ts.CompilerOptions): ts.CompilerOptions {
  return {
    ...options,
    noEmit: true,
    composite: false,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    incremental: false,
  }
}

/**
 * Create a no-emit program for selected roots with one compiler face's Project References.
 * @param projectRoot - repository root containing the face aggregate.
 * @param rootNames - repository-relative or absolute source roots to check.
 * @param face - compiler face whose options and Project References apply.
 * @returns a program that consumes the referenced projects' emitted declarations.
 */
export function createCompilerFaceConsumerProgram(
  projectRoot: string,
  rootNames: readonly string[],
  face: CompilerFace = 'host',
): ts.Program {
  const rootConfig = parseConfig(resolve(projectRoot, `tsconfig.${face}.json`))
  return ts.createProgram({
    rootNames: rootNames.map(file => resolve(projectRoot, file)),
    options: semanticCompilerOptions(rootConfig.options),
    ...rootConfig.projectReferences === undefined
      ? {}
      : { projectReferences: rootConfig.projectReferences },
  })
}

/**
 * Create a no-emit program for integration tests that intentionally consume both compiler faces.
 *
 * The selected tests are the only root files. Project References are reused
 * from the application checker and both aggregates, so this program consumes
 * their emitted declarations without flattening either aggregate's file list.
 *
 * @param projectRoot - repository root containing both compiler aggregates.
 * @param rootNames - exact repository-relative cross-face test roots.
 * @param applicationConfig - no-emit application config supplying compiler options and references.
 * @returns a program over only the selected tests and their imported dependencies.
 */
export function createPostGenerationCrossFaceProgram(
  projectRoot: string,
  rootNames: readonly string[],
  applicationConfig = 'apps/desktop/tsconfig.json',
): ts.Program {
  const application = parseConfig(resolve(projectRoot, applicationConfig))
  const aggregateReferences = (['host', 'client'] as const)
    .flatMap(face => parseConfig(resolve(projectRoot, `tsconfig.${face}.json`)).projectReferences ?? [])
  const projectReferences = deduplicateProjectReferences([
    ...(application.projectReferences ?? []),
    ...aggregateReferences,
  ])
  return ts.createProgram({
    rootNames: rootNames.map(file => resolve(projectRoot, file)),
    options: semanticCompilerOptions(application.options),
    ...projectReferences.length === 0 ? {} : { projectReferences },
  })
}

function deduplicateProjectReferences(references: readonly ts.ProjectReference[]): ts.ProjectReference[] {
  const unique = new Map<string, ts.ProjectReference>()
  for (const reference of references) {
    const path = ts.resolveProjectReferencePath(reference)
    if (!unique.has(path)) unique.set(path, reference)
  }
  return [...unique.values()]
}

/** A repository-scoped TypeScript Program and its shared TypeChecker. */
export class TypeScriptProject {
  /** The bound cross-file TypeScript program. */
  readonly program: ts.Program
  /** The checker shared by every semantic query in this project. */
  readonly checker: ts.TypeChecker

  /**
   * @param projectRoot - repository root the program is seeded and reported from.
   * @param face - which compiler face aggregate to flatten.
   */
  constructor(readonly projectRoot: string, face: CompilerFace = 'host') {
    const graph = loadProjectGraph(projectRoot, face)
    this.program = ts.createProgram(graph.rootNames, semanticCompilerOptions(graph.options))
    this.checker = this.program.getTypeChecker()
  }

  /**
   * Return every source file loaded into the flattened root project graph.
   * @returns program source files, including libraries and external dependencies.
   */
  sourceFiles(): readonly ts.SourceFile[] {
    return this.program.getSourceFiles()
  }

  /**
   * Render a loaded source file relative to the project root.
   * @param sourceFile - a source file from this project.
   * @returns a slash-separated repository-relative path.
   */
  relativePath(sourceFile: ts.SourceFile): string {
    return relative(this.projectRoot, sourceFile.fileName).replaceAll('\\', '/')
  }

  /**
   * Return one program source file by repository-relative path.
   * @param relativePath - path relative to the project root.
   * @returns the source file bound into this project.
   * @throws if a requested root or imported source was not loaded.
   */
  sourceFile(relativePath: string): ts.SourceFile {
    const sourceFile = this.program.getSourceFile(resolve(this.projectRoot, relativePath))
    if (!sourceFile) throw new Error(`TypeScript project did not load ${relativePath}`)
    return sourceFile
  }
}
