/** Reject proof-only identity, authority, and trust reachable from Companion product entries. */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PRODUCT_ENTRIES = [
  'apps/desktop/src/main.ts',
  'apps/mobile/src/main.tsx',
  'apps/platform/src/boot.ts',
] as const
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'] as const
const IMPORT_PATTERN = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/gu
const FORBIDDEN = [
  { label: 'fixed GitHub fixture identity', pattern: /\boctocat\b/u },
  { label: 'a keyless product provider', pattern: /\b(?:DevelopmentKeyless\w*|\w*PERSONAL_PAIRING_KEYLESS)\b/u },
  { label: 'an in-memory product authority', pattern: /\bMemory(?:Account|PersonalPairing|Relay|PlatformCapacity)\w*\b/u },
  { label: 'the generic development/production selector', pattern: /\bloadPlatformEnvironment\b/u },
  { label: 'a development Platform identity', pattern: /\b(?:DSH|VITE)_PLATFORM_DEVELOPMENT_[A-Z_]+\b/u },
  { label: 'a proof-only Companion example', pattern: /(?:local-companion-platform|prototype-companion)/u },
  { label: 'a bundled development trust origin', pattern: /dev\.gestaltrun\.invalid/u },
  { label: 'a disabled certificate check', pattern: /rejectUnauthorized\s*:\s*false/u },
] as const

/**
 * Follow relative code imports and report proof-only product composition.
 * @param root - repository root or a fixture with the same product entries.
 * @returns stable path-and-line diagnostics.
 */
export function collectCompanionProductEntryResidue(root: string): string[] {
  const pending = PRODUCT_ENTRIES.map(entry => resolve(root, entry))
  const visited = new Set<string>()
  const failures: string[] = []
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file) || !existsSync(file)) continue
    visited.add(file)
    const source = readFileSync(file, 'utf8')
    const display = relative(root, file).split(sep).join('/')
    source.split('\n').forEach((line, index) => {
      const forbidden = FORBIDDEN.find(({ pattern }) => pattern.test(line))
      if (forbidden !== undefined) {
        failures.push(`${display}:${String(index + 1)}: contains ${forbidden.label}.`)
      }
    })
    for (const specifier of relativeImports(source)) {
      const dependency = resolveCodeImport(file, specifier)
      if (dependency !== undefined) pending.push(dependency)
    }
  }
  return failures.sort()
}

function relativeImports(source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)].flatMap(match => match[1] ?? match[2] ?? [])
}

function resolveCodeImport(importer: string, specifier: string): string | undefined {
  const base = resolve(dirname(importer), specifier)
  if (SOURCE_EXTENSIONS.includes(extname(base) as (typeof SOURCE_EXTENSIONS)[number])) {
    return existsSync(base) ? base : undefined
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = base + extension
    if (existsSync(candidate)) return candidate
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = resolve(base, `index${extension}`)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const failures = collectCompanionProductEntryResidue(ROOT)
  if (failures.length > 0) {
    process.stderr.write('verify-companion-product-entry: proof-only product composition found:\n')
    for (const failure of failures) process.stderr.write(`  ${failure}\n`)
    process.exit(1)
  }
  process.stdout.write('verify-companion-product-entry: product entries reach only operated composition.\n')
}
