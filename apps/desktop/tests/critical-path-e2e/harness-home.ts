/** Isolated configuration for the critical-path Electron runner. */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { dump, load } from 'js-yaml'
import { TITLE_MODEL } from './keyless-model.ts'

/**
 * Write runner-owned configuration into an existing private home.
 * @param dshHome - isolated home directory owned by this invocation.
 */
export async function writeHarnessHome(dshHome: string): Promise<void> {
  const base = load(await readFile(new URL('../../../../packages/bundle/base/cordis.patch.yml', import.meta.url), 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(base)) throw new TypeError('Critical-path base bundle must be a patch list')
  const entries = applyEntryPatches([], base as PatchOptions[], (message) => { throw new Error(message) })
  const titleConfig: unknown = entries.find(entry => entry.id === 'session-title-llm')?.config
  if (titleConfig === null || typeof titleConfig !== 'object' || Array.isArray(titleConfig)) {
    throw new TypeError('Critical-path base bundle must declare session-title-llm config')
  }
  const titlePatch = dump([{
    id: 'session-title-llm',
    config: { ...titleConfig, provider: 'deepseek-official', model: TITLE_MODEL },
  }], { schema: entryListSchema }).trimEnd()
  await writeFile(join(dshHome, 'cordis.patch.yml'), [
    '- id: session-persistence-jsonl',
    '  config:',
    "    root: !!js dshHomePath('sessions')",
    '    packChunks: false',
    '    compression: none',
    titlePatch,
    '- id: directory-picker',
    '  disabled: true',
    '- insert:',
    '    - id: directory-picker-browse',
    "      name: '@deepseek-ai/dsh-host-directory-picker-browse'",
    '    - id: ui-directory-picker-browse',
    "      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'",
    '',
  ].join('\n'), { mode: 0o600 })
  await writeFile(join(dshHome, 'settings.yaml'), [
    'ui-onboarding:',
    '  welcomeNoticeVersion: "2026-08-13.1"',
    '',
  ].join('\n'), { mode: 0o600 })
}
