/** Source entry for Environment `production` validation. Not bundled into `boot.mjs`. */

import { runPlatformProductionEnvCli } from './production-env.ts'

process.exit(runPlatformProductionEnvCli())
