/** Production Platform executable over the entry-owned launch composition. */

import { launchOperatedPlatform } from './launch.ts'

const running = await launchOperatedPlatform()
console.error(`platform: listening on ${running.context.webServer.host}:${String(running.context.webServer.port)}`)
