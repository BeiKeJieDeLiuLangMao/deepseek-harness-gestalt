import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { UserConfig } from 'tsdown'
import { describe, expect, it } from 'vitest'

type BuildConfig = (inlineConfig: Pick<UserConfig, 'env'>) => UserConfig[]

interface PackageManifest {
  readonly files: readonly string[]
}

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest

async function loadBuildConfig(): Promise<BuildConfig> {
  const configUrl = new URL('../tsdown.config.ts', import.meta.url).href
  const loaded = await import(configUrl) as { readonly default: BuildConfig }
  return loaded.default
}

function soleEntry(config: UserConfig): string {
  if (!Array.isArray(config.entry) || config.entry.length !== 1 || typeof config.entry[0] !== 'string') {
    throw new Error('remote-access-client build entries must each name one emitted JavaScript file')
  }
  return config.entry[0]
}

function outputPath(config: UserConfig): string {
  if (typeof config.outDir !== 'string') {
    throw new Error('remote-access-client build entries must declare an output directory')
  }
  return `${config.outDir}/${basename(soleEntry(config))}`
}

describe('remote-access-client build faces', () => {
  it('skips the package before Host entry resolution', async () => {
    const buildConfig = await loadBuildConfig()

    expect(buildConfig({ env: { DSH_BUILD_FACE: 'host' } })).toEqual([{ entry: '' }])
  })

  it('emits every published JavaScript artifact with its required Client platform', async () => {
    const buildConfig = await loadBuildConfig()
    const configs = buildConfig({ env: { DSH_BUILD_FACE: 'client' } })
    const publishedJavaScript = manifest.files.filter(path => path.endsWith('.js')).sort()

    expect(configs.map(outputPath).sort()).toEqual(publishedJavaScript)
    expect(Object.fromEntries(configs.map(config => [basename(soleEntry(config)), config.platform]))).toEqual({
      'index.js': 'browser',
      'invariant.js': 'browser',
      'desktop-relay-lifecycle.js': 'browser',
      'node-relay-socket.js': 'node',
    })
  })
})
