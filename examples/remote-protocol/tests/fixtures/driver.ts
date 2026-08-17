#!/usr/bin/env node
/** Boot the real keyless Remote Protocol Loader composition. */

import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('remote-protocol driver requires a config path')

const ctx = await boot('remote-protocol-keyless', resolveConfigPath(configPath, undefined))
await ctx.fiber.dispose()
