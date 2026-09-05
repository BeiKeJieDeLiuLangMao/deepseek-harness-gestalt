/**
 * Web patch composition over dsh-base: overlay config replacement must
 * restate every tools key the deferred Browser generation requires.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'

function loadPatches(url: URL): PatchOptions[] {
  const parsed = yaml.load(readFileSync(fileURLToPath(url), 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new TypeError('patch must parse to a list')
  return parsed as PatchOptions[]
}

function compose(layers: readonly PatchOptions[][]) {
  return applyEntryPatches([], structuredClone(layers.flat()), () => {})
}

describe('web-app tools overlay over dsh-base', () => {
  it('keeps required toolSearch when restating DSH_TOOLS_MODE', () => {
    const base = loadPatches(new URL('../../base/cordis.patch.yml', import.meta.url))
    const overlay = loadPatches(new URL('../cordis.patch.yml', import.meta.url))
    const tools = compose([base, overlay]).find(entry => entry.id === 'tools')
    expect(tools?.config).toEqual({
      toolSearch: { maxResultBytes: 65536 },
      mode: { __jsExpr: 'process.env.DSH_TOOLS_MODE' },
    })
    expect(compose([base, overlay]).some(entry => entry.id === 'tool-browser')).toBe(true)
  })
})
