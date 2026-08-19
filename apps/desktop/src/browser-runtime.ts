/**
 * In-process Electron Browser Runtime owned by the Desktop Host.
 * @module @deepseek-ai/dsh-desktop/browser-runtime
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ElectronBrowserRuntime, { listenElectronBrowserHttp } from '@deepseek-ai/dsh-browser-runtime-electron'
import type { ElectronBrowserHttpServer } from '@deepseek-ai/dsh-browser-runtime-electron'

/** Isolated Chromium partition root plus loopback HTTP origin for the Web Host. */
export interface DesktopBrowserRuntime {
  /** Loopback origin the Tandem-shaped HTTP client uses. */
  readonly origin: string
  /** Bearer-token file the HTTP client reads. */
  readonly tokenFile: string
  /** Isolated Chromium partition directory under Electron userData. */
  readonly partitionRoot: string
  /** Stop the HTTP listener and dispose hidden windows. */
  dispose(): Promise<void>
}

/**
 * Start one in-process Electron Browser Runtime and bind Tandem's HTTP vocabulary.
 * Partition files stay under Electron userData; they never write Tandem Browser's Application Support directory.
 * @param userData - Electron `app.getPath('userData')`.
 * @returns origin, token file, and disposer.
 */
export async function startDesktopBrowserRuntime(userData: string): Promise<DesktopBrowserRuntime> {
  const partitionRoot = join(userData, 'browser-runtime')
  const tokenFile = join(partitionRoot, 'api-token')
  await mkdir(partitionRoot, { recursive: true })
  const ctx = new Context()
  await ctx.plugin(ElectronBrowserRuntime, { idPrefix: 'gestalt' })
  const server: ElectronBrowserHttpServer = await listenElectronBrowserHttp({
    runtime: ctx.browserRuntime,
    tokenFile,
  })
  return {
    origin: server.origin,
    tokenFile,
    partitionRoot,
    dispose: async () => {
      await server.close()
      await ctx.fiber.dispose()
    },
  }
}
