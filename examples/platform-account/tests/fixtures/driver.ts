#!/usr/bin/env node
/** Boot the real keyless Platform Account Loader composition. */

import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('platform-account driver requires a config path')

const ctx = await boot('platform-account-keyless', resolveConfigPath(configPath, undefined))
await ctx.fiber.dispose()
