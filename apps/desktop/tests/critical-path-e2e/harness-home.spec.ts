/** Profile composition regression for the isolated Electron home. */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import { expect, it } from 'vitest'
import { writeHarnessHome } from './harness-home.ts'
import { TITLE_MODEL } from './keyless-model.ts'

it('retains the shipped title policy while overriding only its provider route', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-critical-home-'))
  try {
    const base = load(await readFile(new URL('../../../../packages/bundle/base/cordis.patch.yml', import.meta.url), 'utf8'), { schema: entryListSchema }) as PatchOptions[]
    const entries = applyEntryPatches([], base, () => { throw new Error('Unexpected base patch warning') })
    const original = entries.find(entry => entry.id === 'session-title-llm')
    expect(original).toBeDefined()
    await writeHarnessHome(home)
    const overrides = load(await readFile(join(home, 'cordis.patch.yml'), 'utf8'), { schema: entryListSchema }) as PatchOptions[]
    const titlePatch = overrides.filter(entry => entry.id === 'session-title-llm')
    expect(titlePatch).toHaveLength(1)
    const composed = applyEntryPatches(entries, titlePatch, () => { throw new Error('Unexpected title patch warning') })
    expect(composed.find(entry => entry.id === 'session-title-llm')?.config).toEqual({
      ...original?.config,
      provider: 'deepseek-official',
      model: TITLE_MODEL,
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
