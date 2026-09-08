import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// All faces run even when ordinary Desktop typing fails; no displaced suite loses its check.
const root = fileURLToPath(new URL('../', import.meta.url))
const compiler = fileURLToPath(import.meta.resolve('typescript/bin/tsc'))
let failed = false
// The existing scheduler invokes typecheck:contracts-ready after Host contract preparation.
// Preserve its Client/Electron checks while collecting their failures before Desktop checking.
if (process.argv.includes('--contracts-ready')) {
  const commands = [
    [process.execPath, [compiler, '-b', 'tsconfig.client.json']],
    [process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'run', 'typecheck:e2e-electron']],
  ]
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
    if (result.error !== undefined) console.error(result.error)
    if (result.status !== 0) failed = true
  }
}
for (const project of [
  'apps/desktop/tsconfig.json',
  'apps/desktop/tests/companion-fixture/tsconfig.json',
  'apps/desktop/tests/tsconfig.json',
]) {
  console.log(`\n=== ${project} ===`)
  const result = spawnSync(process.execPath, [compiler, '-p', project, '--noEmit', '--pretty', 'false'], {
    cwd: root, stdio: 'inherit',
  })
  if (result.error !== undefined) console.error(result.error)
  console.log(`=== ${project}: exit ${String(result.status)} ===`)
  if (result.status !== 0) failed = true
}
process.exitCode = failed ? 1 : 0
