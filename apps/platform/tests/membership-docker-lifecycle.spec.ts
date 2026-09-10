import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const baseImage = process.env.DSH_MEMBERSHIP_DOCKER_TEST_IMAGE
const host = readFileSync(new URL('../scripts/platform-host-deploy.sh', import.meta.url), 'utf8')
const python = host.split("<<'MEMBERSHIP_PY'\n")[1]?.split('\nMEMBERSHIP_PY')[0]
if (python === undefined) throw new Error('membership host entry is missing')

describe.skipIf(baseImage === undefined)('Membership CLI with a real Docker daemon', () => {
  it('kills and removes the exact daemon-held CLI before returning from a client timeout', () => {
    if (baseImage === undefined || !/^[a-z0-9./:@_-]+$/u.test(baseImage)) throw new Error('Select one explicit Docker test base image')
    const directory = mkdtempSync(join(tmpdir(), 'dsh-membership-docker-'))
    const transaction = randomBytes(32).toString('hex')
    const image = `dsh-membership-lifecycle:${transaction}`
    const stateDirectory = join(directory, 'state')
    const evidence = join(directory, 'evidence')
    mkdirSync(stateDirectory, { mode: 0o700 })
    mkdirSync(evidence, { mode: 0o700 })
    const envPath = join(directory, 'candidate.env')
    writeFileSync(envPath, 'PLATFORM_MEMBERSHIP_BACKEND=postgres\n', { mode: 0o600 })
    writeFileSync(join(directory, 'membership-cutover-cli.mjs'), [
      "import { appendFileSync } from 'node:fs'",
      "process.on('SIGTERM', () => {})",
      "setInterval(() => appendFileSync('/evidence/progress', 'x'), 20)",
    ].join('\n'))
    writeFileSync(join(directory, 'Dockerfile'), [
      `FROM ${baseImage}`, 'WORKDIR /app', `LABEL dsh.test.membership-transaction=${transaction}`,
      'COPY membership-cutover-cli.mjs /app/dist/membership-cutover-cli.mjs',
    ].join('\n'))
    let built = false
    try {
      const build = spawnSync('docker', ['build', '--tag', image, directory], { encoding: 'utf8', timeout: 120_000 })
      expect(build.status, build.stderr).toBe(0)
      built = true
      const prefix = python.slice(0, python.indexOf('try:\n    require(not root.is_symlink()'))
        .replaceAll('/var/lib/dsh-platform-membership-cutover', stateDirectory)
        .replaceAll('/run/dsh-platform-candidate.env', envPath)
      const script = join(directory, 'run.py')
      writeFileSync(script, `${prefix}\nstate = ${JSON.stringify({ phase: 'importing', runtimeEnvDigest: createHash('sha256').update(readFileSync(envPath)).digest('hex') })}\n`
        + `try:\n    cli('membership-cutover-cli', 'import', network='none', mounts=('--mount', ${JSON.stringify(`type=bind,source=${evidence},target=/evidence`)}))\n`
        + "except subprocess.TimeoutExpired:\n    require(state['cli']['status'] == 'quiescent', 'daemon CLI remains live')\n"
        + "else:\n    raise RuntimeError('the test CLI did not reach its deadline')\n")
      const result = spawnSync('python3', [script, 'membership-import'], { encoding: 'utf8', timeout: 85_000, env: {
        PATH: process.env.PATH, DSH_MEMBERSHIP_DEADLINE: String(Math.floor(Date.now() / 1000) + 70),
        DSH_MEMBERSHIP_ACTION_DEADLINE: String(Math.floor(Date.now() / 1000) + 70),
        DSH_MEMBERSHIP_TRANSACTION: transaction, DSH_DEPLOY_CANDIDATE: '1'.repeat(40), DSH_DEPLOY_IMAGE: image,
        DSH_MEMBERSHIP_SOURCE_SHA256: '2'.repeat(64), DSH_MEMBERSHIP_PREDECESSOR_IMAGE: 'unused',
        DSH_MEMBERSHIP_PREDECESSOR_SHA: '3'.repeat(40), DSH_MEMBERSHIP_INSTANCE_ID: 'isolated-test', DSH_RELAY_INSTANCE_ID: 'relay-1',
      } })
      expect(result.status, result.stderr).toBe(0)
      const progress = readFileSync(join(evidence, 'progress'), 'utf8')
      expect(progress.length).toBeGreaterThan(0)
      spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 200)'])
      expect(readFileSync(join(evidence, 'progress'), 'utf8')).toBe(progress)
      expect(spawnSync('docker', ['ps', '-aq', '--filter', `label=dsh.platform.membership-transaction=${transaction}`], { encoding: 'utf8' }).stdout.trim()).toBe('')
    } finally {
      const containers = spawnSync('docker', ['ps', '-aq', '--filter', `label=dsh.platform.membership-transaction=${transaction}`], { encoding: 'utf8', timeout: 10_000 })
      if (containers.status !== 0) throw new Error('Cannot confirm the test transaction container inventory')
      for (const id of containers.stdout.trim().split('\n').filter(Boolean)) {
        const removed = spawnSync('docker', ['rm', '-f', id], { stdio: 'ignore', timeout: 10_000 })
        if (removed.status !== 0) throw new Error('Cannot confirm the test transaction container cleanup')
      }
      if (built && spawnSync('docker', ['image', 'rm', image], { stdio: 'ignore', timeout: 10_000 }).status !== 0) {
        throw new Error('Cannot remove the isolated test image')
      }
      rmSync(directory, { recursive: true, force: true })
    }
  }, 240_000)
})
