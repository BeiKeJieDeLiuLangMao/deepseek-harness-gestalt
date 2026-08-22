/** Reject Mobile Companion push product residue from shipped source and configuration. */

import { globSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

const PRODUCT_GLOBS = [
  'apps/mobile/**/*',
  'apps/platform/src/**/*',
  'apps/platform/package.json',
  'apps/desktop/src/**/*',
  'packages/platform/*/src/**/*',
  'packages/platform/*/package.json',
  'packages/extensions/tool-cordis/src/api-catalog.ts',
  '.github/workflows/platform-*.yml',
  'package.json',
  'pnpm-lock.yaml',
]

const EXCLUDED_PATHS = /(?:^|\/)(?:tests?|public)(?:\/|$)|(?:^|\/)(?:README|CONTEXT)(?:\.zh)?\.md$|\.i18n\.yaml$/u

const FORBIDDEN_TOKENS = [
  { label: 'APNs', pattern: /(?:^|[^a-z0-9])apns(?:$|[^a-z0-9])/iu },
  { label: 'FCM', pattern: /(?:^|[^a-z0-9])fcm(?:$|[^a-z0-9])/iu },
  { label: 'CompanionPush symbol', pattern: /\bCompanionPush[A-Za-z0-9_]*\b/u },
  { label: 'push token symbol', pattern: /\b(?:PushPlatform|PushTokenRegistration|PushTokenStore)\b/u },
  { label: 'push product language', pattern: /\bpush[- ](?:token|notification|delivery|provider|hint|quota|metric|secret)s?\b/iu },
  { label: 'push product language', pattern: /推送/u },
  { label: 'push operation', pattern: /\b(?:emit|register|unregister)-push-(?:hint|token)\b/u },
  { label: 'push quota or persistence', pattern: /\bpushHints(?:At|PerAccountPerDay)\b/u },
  { label: 'Capacitor push dependency', pattern: /@capacitor\/push-notifications\b/u },
  { label: 'Firebase messaging dependency', pattern: /\b(?:firebase-admin|firebase\/messaging)\b/u },
] as const

/**
 * Find forbidden Companion push product tokens in shipped source and configuration.
 * @param root - repository root or a fixture with the same relative layout.
 * @returns stable path-and-line diagnostics.
 */
export function collectCompanionPushResidue(root: string): string[] {
  const files = new Set<string>()
  for (const pattern of PRODUCT_GLOBS) {
    for (const file of globSync(pattern, { cwd: root })) {
      const relative = file.split(sep).join('/')
      if (!EXCLUDED_PATHS.test(relative) && statSync(resolve(root, file)).isFile()) files.add(relative)
    }
  }
  const failures: string[] = []
  for (const file of [...files].sort()) {
    const lines = readFileSync(resolve(root, file), 'utf8').split('\n')
    lines.forEach((line, index) => {
      const forbidden = FORBIDDEN_TOKENS.find(({ pattern }) => pattern.test(line))
      if (forbidden === undefined) return
      failures.push(
        `${file}:${String(index + 1)}: contains forbidden Companion push product token ${forbidden.label}.`,
      )
    })
  }
  return failures
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const failures = collectCompanionPushResidue(ROOT)
  if (failures.length > 0) {
    process.stderr.write('verify-companion-no-push: product residue found:\n')
    for (const failure of failures) process.stderr.write(`  ${failure}\n`)
    process.exit(1)
  }
  process.stdout.write('verify-companion-no-push: shipped source and configuration contain no Companion push product.\n')
}
