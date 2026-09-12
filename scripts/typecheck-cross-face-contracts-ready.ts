/** Typecheck exact cross-face integration tests after Host and Client artifacts exist. */

import { relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import {
  collectPostGenerationApplicationViolations,
  POST_GENERATION_CROSS_FACE_TESTS,
} from './project-reference-faces.ts'
import { createPostGenerationCrossFaceProgram } from './ts-project.ts'

function repositoryPath(path: string): string {
  return path.split(sep).join('/')
}

/**
 * Return the exact integration-test inventory after validating its build placement.
 * @param scanRoot - repository root containing compiler configs and test files.
 * @returns the post-generation cross-face test roots.
 * @throws when the shared inventory or public build order is invalid.
 */
export function crossFaceContractTests(scanRoot: string): string[] {
  const violations = collectPostGenerationApplicationViolations(scanRoot)
  if (violations.length > 0) throw new Error(violations.join('\n'))
  return [...POST_GENERATION_CROSS_FACE_TESTS]
}

/**
 * Typecheck the selected cross-face tests without flattening either aggregate.
 * @param scanRoot - repository root containing both built compiler faces.
 * @param tests - exact repository-relative integration-test roots.
 * @returns all syntactic and semantic diagnostics.
 */
export function crossFaceContractDiagnostics(
  scanRoot: string,
  tests: readonly string[],
): readonly ts.Diagnostic[] {
  return ts.getPreEmitDiagnostics(createPostGenerationCrossFaceProgram(scanRoot, tests))
}

function main(): number {
  const root = resolve(import.meta.dirname, '..')
  try {
    const tests = crossFaceContractTests(root)
    const diagnostics = crossFaceContractDiagnostics(root, tests)
    if (diagnostics.length > 0) {
      process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: file => file,
        getCurrentDirectory: () => root,
        getNewLine: () => ts.sys.newLine,
      }))
      return 1
    }
    const roots = tests.map(test => repositoryPath(relative(root, resolve(root, test))))
    console.log(`typecheck-cross-face-contracts-ready: ${String(roots.length)} integration test(s) passed.`)
    return 0
  } catch (error) {
    console.error(`typecheck-cross-face-contracts-ready: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (import.meta.main) process.exitCode = main()
