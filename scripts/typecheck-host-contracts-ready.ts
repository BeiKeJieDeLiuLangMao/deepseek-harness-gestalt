/** Typecheck Host tests that consume generated Remote declarations after Host tsdown. */

import { globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import ts from 'typescript'
import { createCompilerFaceConsumerProgram } from './ts-project.ts'

export const HOST_CONTRACT_CONSUMER_GLOB = 'packages/*/*/tests/**/*.generated.host.spec.ts'
const HOST_TEST_GLOB = 'packages/*/*/tests/**/*.host.spec.{ts,tsx}'
const GENERATED_REMOTE_IMPORT = /from\s+['"]@deepseek-ai\/dsh-[^'"]+\/remote['"]/u

function repositoryPath(path: string): string {
  return path.split(sep).join('/')
}

function requireHostAggregateExclusion(scanRoot: string): void {
  const configPath = resolve(scanRoot, 'tsconfig.host.json')
  const read = ts.readConfigFile(configPath, file => readFileSync(file, 'utf8'))
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
  }
  const exclude = (read.config as { exclude?: unknown }).exclude
  if (!Array.isArray(exclude) || !exclude.includes(HOST_CONTRACT_CONSUMER_GLOB)) {
    throw new Error(`tsconfig.host.json must exclude ${JSON.stringify(HOST_CONTRACT_CONSUMER_GLOB)}`)
  }
}

/**
 * Select every Host test that consumes generated Remote declarations.
 * @param scanRoot - repository root containing Host package tests.
 * @returns sorted repository-relative test paths.
 * @throws if the Host aggregate exclusion is absent, no test is selected, or a Remote consumer lacks the generated-test suffix.
 */
export function hostContractConsumerTests(scanRoot: string): string[] {
  requireHostAggregateExclusion(scanRoot)
  const selected = globSync(HOST_CONTRACT_CONSUMER_GLOB, { cwd: scanRoot })
    .map(repositoryPath)
    .sort()
  const selectedSet = new Set(selected)
  const misplaced = globSync(HOST_TEST_GLOB, { cwd: scanRoot })
    .map(repositoryPath)
    .filter(file => !selectedSet.has(file)
      && GENERATED_REMOTE_IMPORT.test(readFileSync(resolve(scanRoot, file), 'utf8')))
    .sort()
  if (misplaced.length > 0) {
    throw new Error(
      `Host tests importing generated /remote declarations must end in .generated.host.spec.ts:\n${misplaced.join('\n')}`,
    )
  }
  if (selected.length === 0) {
    throw new Error(`no Host contract consumers matched ${HOST_CONTRACT_CONSUMER_GLOB}`)
  }
  return selected
}

/**
 * Typecheck selected generated-contract consumers through the Host aggregate's Project References.
 * @param scanRoot - repository root containing `tsconfig.host.json`.
 * @param tests - repository-relative Host contract consumer paths.
 * @returns all syntactic and semantic diagnostics.
 */
export function hostContractConsumerDiagnostics(
  scanRoot: string,
  tests: readonly string[],
): readonly ts.Diagnostic[] {
  const program = createCompilerFaceConsumerProgram(scanRoot, tests, 'host')
  return ts.getPreEmitDiagnostics(program)
}

function main(): number {
  const root = resolve(import.meta.dirname, '..')
  try {
    const tests = hostContractConsumerTests(root)
    const diagnostics = hostContractConsumerDiagnostics(root, tests)
    if (diagnostics.length > 0) {
      process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: file => file,
        getCurrentDirectory: () => root,
        getNewLine: () => ts.sys.newLine,
      }))
      return 1
    }
    console.log(`typecheck-host-contracts-ready: ${String(tests.length)} generated Remote consumer test(s) passed.`)
    return 0
  } catch (error) {
    console.error(`typecheck-host-contracts-ready: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (import.meta.main) process.exitCode = main()
