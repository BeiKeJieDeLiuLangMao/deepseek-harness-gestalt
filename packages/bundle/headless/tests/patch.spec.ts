/**
 * Headless patch composition over dsh-base: overlay config replacement must
 * restate every tools key the deferred Browser generation requires.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import BrowserRuntimeDeterministic from '@deepseek-ai/dsh-browser-runtime-deterministic'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolBrowser from '@deepseek-ai/dsh-tool-browser'

function loadPatches(url: URL): PatchOptions[] {
  const parsed = yaml.load(readFileSync(fileURLToPath(url), 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new TypeError('patch must parse to a list')
  return parsed as PatchOptions[]
}

function compose(layers: readonly PatchOptions[][]) {
  return applyEntryPatches([], structuredClone(layers.flat()), () => {})
}

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('headless tools overlay over dsh-base', () => {
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

  it('registers deferred browser_create from the composed tools config', async () => {
    const ctx = await mountBrowser(composedToolsConfig())
    expect(ctx.tools.get('browser_create')?.deferLoading).toBe(true)
    expect(ctx.tools.schemas().map(schema => schema.name)).not.toContain('browser_create')
    expect(ctx.tools.catalogSchemas().map(schema => schema.name)).toContain('browser_create')
    await ctx.fiber.dispose()
  })

  it('fails deferred browser_create when an overlay drops toolSearch', async () => {
    const base = loadPatches(new URL('../../base/cordis.patch.yml', import.meta.url))
    const dropped = compose([base, [{ id: 'tools', config: { mode: 'native' } }]])
    const tools = dropped.find(entry => entry.id === 'tools')
    await expect(mountBrowser((tools?.config ?? {}) as Record<string, unknown>))
      .rejects.toThrow(/browser_create.*deferLoading but dsh-tools toolSearch is disabled/)
  })
})

function composedToolsConfig(): Record<string, unknown> {
  const base = loadPatches(new URL('../../base/cordis.patch.yml', import.meta.url))
  const overlay = loadPatches(new URL('../cordis.patch.yml', import.meta.url))
  const tools = compose([base, overlay]).find(entry => entry.id === 'tools')
  if (tools?.config === undefined || typeof tools.config !== 'object') {
    throw new Error('composed headless tools row must have a config object')
  }
  return tools.config as Record<string, unknown>
}

async function mountBrowser(toolsRow: Record<string, unknown>): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  const { mode: _mode, ...registry } = toolsRow
  await ctx.plugin(ToolRuntime, registry)
  await ctx.plugin(BrowserRuntimeDeterministic, {
    pages: [{
      url: 'https://example.test/',
      title: 'Example',
      text: 'page',
      screenshotPngBase64: PNG_1X1,
    }],
  })
  await ctx.plugin(ToolBrowser)
  return ctx
}
