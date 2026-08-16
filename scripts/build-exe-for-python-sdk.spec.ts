import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'

const root = resolve(import.meta.dirname, '..')

describe('single-executable production deploy', () => {
  it('allows unrelated patches only for the scoped runtime deploy', () => {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const output = execFileSync(process.execPath, [
      '--import',
      'tsx/esm',
      'scripts/build-exe-for-python-sdk.ts',
      '--targets=node24-linux-x64',
      '--skip-build',
      '--dry-run',
    ], {
      cwd: root,
      encoding: 'utf8',
    })

    const commands = output.split('\n').filter(line => line.includes(`[dry-run] ${pnpm}`))
    expect(commands).toContain(
      `build-exe-for-python-sdk: [dry-run] ${pnpm} --filter dsh-jsonrpc-agent-pkg deploy --legacy --prod`
      + ' --config.node-linker=hoisted --config.auto-install-peers=false'
      + ' --config.link-workspace-packages=true --config.allow-unused-patches=true'
      + ` ${resolve(root, 'python/sdk-runtime/src/deepseek_harness_runtime/runtime/node')}`,
    )
    expect(commands.filter(line => line.includes('--config.allow-unused-patches=true'))).toHaveLength(1)
  })

  it('keeps the macOS signer patch required by the root workspace', () => {
    const workspace = load(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8')) as {
      allowUnusedPatches?: boolean
      patchedDependencies?: Record<string, string>
    }
    const patch = workspace.patchedDependencies?.['@electron/osx-sign@1.3.3']

    expect(workspace.allowUnusedPatches).toBeUndefined()
    expect(patch).toBe('patches/@electron__osx-sign@1.3.3.patch')
    expect(existsSync(resolve(root, patch ?? ''))).toBe(true)
  })
})
