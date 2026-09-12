/** Shared shipped `dsh web` launcher for Desktop Host RPC assembled tests. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import { spawnWebHost, type RunningWebHost } from '../src/spawn-web-host.ts'

const here = dirname(fileURLToPath(import.meta.url))
export const desktopTestRepoRoot = join(here, '..', '..', '..')

const TYPERT_PACKAGES = [
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-settings-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-api-workspace-files',
  '@deepseek-ai/dsh-browser-workspace',
  '@deepseek-ai/dsh-client-file-upload',
  '@deepseek-ai/dsh-command-feedback',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-cordis-host-runner',
  '@deepseek-ai/dsh-goal',
  '@deepseek-ai/dsh-host-plugin-inventory',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-member-question-receiver',
  '@deepseek-ai/dsh-message-feedback',
  '@deepseek-ai/dsh-session-reference',
  '@deepseek-ai/dsh-subagent',
] as const

/** Generate Host Typert artifacts required by shipped `dsh web`. */
export function generateDesktopHostTypertArtifacts(): void {
  const artifacts = new WorkspaceTypertGenerator(desktopTestRepoRoot, { checkDiagnostics: true })
    .generate([...TYPERT_PACKAGES], ['host'])
  for (const artifact of artifacts) {
    const output = join(desktopTestRepoRoot, artifact.packageRoot, 'lib')
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
    writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
    if (artifact.remote === undefined) continue
    writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
}

function cleanEnvironment(home: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/iu.test(name)))
  return {
    ...env,
    DSH_AGENTS_HOME: join(home, '.agents'),
    DSH_HOME: join(home, '.dsh'),
    DSH_TELEMETRY_DISABLED: '1',
    NODE_NO_WARNINGS: '1',
    SSH_CONNECTION: '',
    SSH_TTY: '',
    TSX_TSCONFIG_PATH: join(desktopTestRepoRoot, 'tsconfig.json'),
  }
}

/** One live shipped Web Host plus its isolated home. */
export interface ShippedWebHost {
  readonly home: string
  readonly running: RunningWebHost
}

/**
 * Spawn authenticated `dsh web` with the Host-RPC test overlay.
 * @param options - extra env, extra `--patch` files, and optional pre-created home.
 */
export async function startShippedWebHost(
  options: {
    readonly env?: NodeJS.ProcessEnv
    readonly home?: string
    readonly extraPatches?: readonly string[]
    readonly replaceAuthPatch?: boolean
    readonly children: RunningWebHost[]
    readonly homes: string[]
  },
): Promise<ShippedWebHost> {
  const resolved = options.home ?? await mkdtemp(join(tmpdir(), 'dsh-desktop-host-rpc-'))
  if (options.home === undefined) options.homes.push(resolved)
  const tsx = new URL('../../../node_modules/tsx/dist/esm/index.mjs', import.meta.url).href
  const patches = options.replaceAuthPatch === true
    ? [...options.extraPatches ?? []]
    : [
      join(here, 'fixtures/host-rpc-auth.patch.yml'),
      ...options.extraPatches ?? [],
    ]
  const running = await spawnWebHost({
    node: process.execPath,
    args: [
      '--import', tsx,
      join(desktopTestRepoRoot, 'apps/cli/src/bin.ts'),
      'web',
      ...patches.flatMap(path => ['--patch', path]),
      '--no-open', '--host', '127.0.0.1', '--port', '0',
    ],
    cwd: desktopTestRepoRoot,
    env: { ...cleanEnvironment(resolved), ...options.env },
  }, 90_000)
  options.children.push(running)
  return { home: resolved, running }
}

/** Stop every spawned Host and delete isolated homes. */
export async function stopShippedWebHosts(
  children: RunningWebHost[],
  homes: string[],
): Promise<void> {
  await Promise.all(children.splice(0).map(running => running.stop()))
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
}
