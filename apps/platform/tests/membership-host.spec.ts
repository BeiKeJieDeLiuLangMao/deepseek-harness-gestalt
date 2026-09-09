import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../scripts/platform-host-deploy.sh', import.meta.url), 'utf8')
const python = source.split("<<'MEMBERSHIP_PY'\n")[1]?.split('\nMEMBERSHIP_PY')[0]
if (python === undefined) throw new Error('shipped membership host entry is missing')
const dockerFixture = fileURLToPath(new URL('./fixtures/membership-docker.cjs', import.meta.url))
const repo = resolve(import.meta.dirname, '../../..')
const available = spawnSync('python3', ['--version']).status === 0

function hostFixture(run: (fixture: {
  root: string
  volume: string
  source: string
  actions(): string
  action(name: string, failure?: string, relay?: string): SpawnSyncReturns<string>
}) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'dsh-membership-host-'))
  const stateDirectory = join(root, 'host')
  const volume = join(root, 'volume')
  mkdirSync(join(volume, 'production'), { recursive: true })
  mkdirSync(join(root, 'proc'))
  mkdirSync(join(root, 'bin'))
  const document = '{"formatVersion":1,"projects":[],"memberships":[],"invitations":[]}'
  const sourcePath = join(volume, 'production/project-membership.json')
  writeFileSync(sourcePath, document)
  const digest = createHash('sha256').update(document).digest('hex')
  const predecessorImage = `ghcr.io/example/repo/platform@sha256:${'3'.repeat(64)}`
  const identity = ['PLATFORM_ORIGIN=https://platform.example.test', 'PLATFORM_POSTGRES_DATABASE=fixture',
    'PLATFORM_IDENTITY_NAMESPACE=fixture', 'PLATFORM_GITHUB_CREDENTIAL_REFERENCE=credentials://fixture']
  const dockerState = join(root, 'docker.json')
  writeFileSync(dockerState, JSON.stringify({ predecessorImage, predecessorRevision: '4'.repeat(40), candidateRevision: '1'.repeat(40), volume,
    containers: [{ Id: 'b'.repeat(64), Name: '/dsh-platform', Config: { Image: predecessorImage, Env: identity },
      State: { Running: true, Pid: 123, ExitCode: 0, OOMKilled: false }, HostConfig: { RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 } },
      Mounts: [{ Name: 'dsh-platform-membership', Source: volume, Destination: '/var/lib/dsh/projects', RW: true }],
    }],
  }))
  const staged = join(root, 'staged.env')
  writeFileSync(staged, [...identity, 'PLATFORM_MEMBERSHIP_BACKEND=postgres', 'PLATFORM_REMOTE_ATTACHMENT_STORAGE=oss'].join('\n'))
  const executable = join(root, 'bin/docker')
  writeFileSync(executable, `#!/bin/sh\nexec '${process.execPath}' '${dockerFixture}' "$@"\n`)
  chmodSync(executable, 0o700)
  // The fixture owns the same private paths under its uid; Docker and /proc are controlled providers.
  const body = python.replace('timeout=remaining())', 'timeout=(2 if e.get("MEMBERSHIP_FAILURE") == "daemon-wait" and (("import" in args and "dist/membership-cutover-cli.mjs" in args) or args[:2] == ("docker", "wait")) else remaining()))').replaceAll('/var/lib/dsh-platform-membership-cutover', stateDirectory)
    .replaceAll('/run/dsh-platform-candidate.env', join(root, 'candidate.env'))
    .replaceAll('/var/lib/docker/volumes/dsh-platform-membership/_data', volume)
    .replace("pathlib.Path('/proc')", `pathlib.Path(${JSON.stringify(join(root, 'proc'))})`)
    .replace('root.stat().st_uid == 0', 'root.stat().st_uid == os.getuid()')
    .replace('os.chown(evidence, 10001, 10001)', 'os.chown(evidence, os.getuid(), os.getgid())')
  const script = join(root, 'host.py')
  writeFileSync(script, body)
  const log = join(root, 'actions')
  writeFileSync(log, '')
  const deadline = String(Math.floor(Date.now() / 1000) + 300)
  try {
    run({ root, volume, source: sourcePath, actions: () => readFileSync(log, 'utf8'),
      action: (name, failure = '', relay = 'relay-1') => spawnSync('python3', [script, `membership-${name}`], { encoding: 'utf8', timeout: 55000,
        env: { PATH: `${dirname(executable)}:${process.env.PATH}`, MEMBERSHIP_DOCKER_STATE: dockerState, MEMBERSHIP_DOCKER_LOG: log,
          MEMBERSHIP_CAPTURE_CLI: fileURLToPath(new URL('../src/membership-cutover-cli.ts', import.meta.url)), MEMBERSHIP_REPO: repo, MEMBERSHIP_FAILURE: failure,
          MEMBERSHIP_DAEMON_MARKER: join(root, 'daemon-marker'), MEMBERSHIP_DAEMON_PID: join(root, 'daemon-pid'),
          DSH_MEMBERSHIP_DEADLINE: deadline, DSH_MEMBERSHIP_ACTION_DEADLINE: deadline, DSH_MEMBERSHIP_TRANSACTION: 'a'.repeat(64), DSH_MEMBERSHIP_SOURCE_SHA256: digest,
          DSH_MEMBERSHIP_PREDECESSOR_IMAGE: predecessorImage, DSH_MEMBERSHIP_PREDECESSOR_SHA: '4'.repeat(40),
          DSH_DEPLOY_CANDIDATE: '1'.repeat(40), DSH_DEPLOY_IMAGE: `ghcr.io/example/repo/platform@sha256:${'2'.repeat(64)}`,
          DSH_MEMBERSHIP_INSTANCE_ID: 'i-first', DSH_RELAY_INSTANCE_ID: relay, DSH_MEMBERSHIP_STAGED_ENV: staged,
          DSH_MEMBERSHIP_COORDINATOR_PHASE: 'importing',
        },
      }),
    })
  } finally {
    const pid = spawnSync('cat', [join(root, 'daemon-pid')], { encoding: 'utf8' })
    if (pid.status === 0) {
      try { process.kill(Number(pid.stdout), 'SIGKILL') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
    rmSync(root, { recursive: true, force: true })
  }
}

describe.skipIf(!available)('Membership maintenance host entry', { timeout: 60_000 }, () => {
  it('reserves cleanup inside the shorter action deadline rather than the transaction deadline', () => {
    const remainingFunction = python.slice(python.indexOf('def remaining():'), python.indexOf('\ndef run('))
    const result = spawnSync('python3', ['-c', [
      'import time',
      'def require(condition, message):',
      '    assert condition, message',
      remainingFunction,
      'deadline = int(time.time()) + 3600',
      'action_deadline = int(time.time()) + 300',
      'assert 238 <= remaining() <= 240',
      'action_deadline = int(time.time()) + 59',
      'try:',
      '    remaining()',
      'except AssertionError:',
      '    pass',
      'else:',
      '    raise AssertionError("cleanup reserve was consumed by CLI work")',
    ].join('\n')], { encoding: 'utf8', timeout: 5000 })
    expect(result.status, result.stderr).toBe(0)
  })

  it('stages without boot, disables restart before stopping, and captures through the real CLI', () =>{  hostFixture((fixture) => {
    expect(fixture.action('stage').status).toBe(0)
    expect(fixture.actions()).not.toContain(' run ')
    expect(fixture.action('fence').status).toBe(0)
    const log = fixture.actions()
    expect(log.indexOf('update --restart=no')).toBeLessThan(log.indexOf('stop --time 60'))
    const captured = fixture.action('capture')
    expect(captured.status, captured.stderr).toBe(0)
    expect(JSON.parse(captured.stdout)).toMatchObject({ phase: 'captured' })
    expect(fixture.actions()).toContain('dist/membership-cutover-cli.mjs capture')
    expect(fixture.actions()).not.toContain('dist/boot.mjs')
  }) })

  it.each(['stop', 'abnormal-stop'])('refuses capture when predecessor fence fails with %s', (failure) =>{  hostFixture((fixture) => {
    expect(fixture.action('stage').status).toBe(0)
    expect(fixture.action('fence', failure).status).not.toBe(0)
    expect(fixture.action('capture').status).not.toBe(0)
    expect(fixture.actions()).not.toContain('dist/membership-cutover-cli.mjs')
  }) })

  it('rejects changed approved source bytes after the fence', () =>{  hostFixture((fixture) => {
    expect(fixture.action('stage').status).toBe(0)
    expect(fixture.action('fence').status).toBe(0)
    writeFileSync(fixture.source, `${readFileSync(fixture.source, 'utf8')} `)
    const result = fixture.action('capture')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('source digest changed')
  }) })

  it('rejects any second-instance source file instead of importing an arbitrary first source', () =>{  hostFixture((fixture) => {
    rmSync(fixture.source)
    expect(fixture.action('stage', '', 'relay-2').status).toBe(0)
    expect(fixture.action('fence', '', 'relay-2').status).toBe(0)
    writeFileSync(join(fixture.volume, 'unexpected.json'), '{}')
    const result = fixture.action('capture', '', 'relay-2')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('second membership source is not empty')
  }) })

  it('reaps an import process retained by the daemon after the Docker client times out', () => {
    hostFixture((fixture) => {
      expect(fixture.action('stage').status).toBe(0)
      expect(fixture.action('fence').status).toBe(0)
      expect(fixture.action('capture').status).toBe(0)
      const result = fixture.action('import', 'daemon-wait')
      expect(result.status).not.toBe(0)
      const before = readFileSync(join(fixture.root, 'daemon-marker'), 'utf8')
      spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 200)'])
      expect(readFileSync(join(fixture.root, 'daemon-marker'), 'utf8')).toBe(before)
      expect(JSON.parse(readFileSync(join(fixture.root, 'host/state.json'), 'utf8'))).toMatchObject({ phase: 'importing' })
    })
  })

  it.each(['relay-1', 'relay-2'])('revalidates live %s source when resuming after capture', (relay) => {
    hostFixture((fixture) => {
      if (relay === 'relay-2') rmSync(fixture.source)
      expect(fixture.action('stage', '', relay).status).toBe(0)
      expect(fixture.action('fence', '', relay).status).toBe(0)
      expect(fixture.action('capture', '', relay).status).toBe(0)
      writeFileSync(fixture.source, '{"formatVersion":1,"projects":[],"memberships":[],"invitations":[]} ')
      const result = fixture.action(relay === 'relay-1' ? 'import' : 'verify-import', '', relay)
      expect(result.status).not.toBe(0)
      expect(fixture.actions()).not.toContain('dist/membership-cutover-cli.mjs import')
    })
  })

  it('keeps the fenced predecessor and snapshot when attachment evidence changes', () =>{  hostFixture((fixture) => {
    expect(fixture.action('stage').status).toBe(0)
    expect(fixture.action('fence').status).toBe(0)
    expect(fixture.action('capture', 'metadata').status).not.toBe(0)
    expect(fixture.actions()).not.toContain('dist/membership-cutover-cli.mjs import')
    expect(fixture.actions()).not.toContain('dist/boot.mjs')
    expect(readFileSync(join(fixture.root, 'host/evidence/source.json'), 'utf8')).toBe(readFileSync(fixture.source, 'utf8'))
  }) })
})
