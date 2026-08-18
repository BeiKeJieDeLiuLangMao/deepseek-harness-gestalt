#!/usr/bin/env node
/** Snapshot-only Loader driver: stream one fixture turn, or a dispose/reload pair, as canonical JSONL. */

import type { Context } from '@deepseek-ai/cordis'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const NAME = 'headless-test-driver'
const [configPath, ...taskParts] = process.argv.slice(2)
if (configPath === undefined || taskParts.length === 0 || taskParts.every(part => part.trim() === '')) {
  throw new Error(`${NAME}: expected <config-path> <task...>`)
}

const uninstallFailLoud = installFailLoud(NAME)
let ctx: Context | undefined
try {
  loadEnv(NAME)
  const resolvedConfigPath = resolveConfigPath(configPath, undefined)
  const observe = (sessionId: string, event: SessionEvent): void => {
    process.stdout.write(`${JSON.stringify({ type: 'session_event', sessionId, event })}\n`)
  }
  ctx = await boot(NAME, resolvedConfigPath)
  const first = await runFixtureTurn(ctx, {
    task: taskParts.join(' '),
    onEvent: observe,
  })
  const reloadTask = process.env.DSH_FIXTURE_RELOAD_TASK
  const reloadSnapshot = process.env.DSH_FIXTURE_RELOAD_SNAPSHOT_FILE
  if (reloadTask === undefined || reloadSnapshot === undefined) {
    process.stdout.write(`${JSON.stringify(first)}\n`)
  } else {
    await ctx.fiber.dispose()
    ctx = undefined
    process.env.DSH_SNAPSHOT_FILE = reloadSnapshot
    ctx = await boot(NAME, resolvedConfigPath)
    const resumed = await runFixtureTurn(ctx, {
      task: reloadTask,
      onEvent: observe,
    })
    process.stdout.write(`${JSON.stringify(resumed)}\n`)
  }
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
  uninstallFailLoud()
}
