#!/usr/bin/env node
/** Boot the real keyless Personal Pairing Loader composition. */

import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('personal-pairing driver requires a config path')

const ctx = await boot('personal-pairing-keyless', resolveConfigPath(configPath, undefined))
await ctx.fiber.dispose()
