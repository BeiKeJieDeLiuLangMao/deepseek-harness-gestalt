import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('usage: relay-loader-smoke.mjs <cordis.yml>')

const ctx = new Context()
try {
  ctx.baseUrl = `${pathToFileURL(dirname(configPath)).href}/`
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)
  if (unloaded.length > 0) throw new Error(`Loader left ${String(unloaded.length)} active entries unloaded`)
  process.stdout.write('RELAY_LOADER bare-subpath=active\n')
} finally {
  await ctx.fiber.dispose()
}
