import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'

const controller = readFileSync(new URL('../scripts/platform-membership-cutover.sh', import.meta.url), 'utf8')
const workflow = yaml.load(readFileSync(new URL('../../../.github/workflows/platform-deploy.yml', import.meta.url), 'utf8')) as {
  on: { workflow_dispatch: { inputs: Record<string, unknown> } }
  jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }>
}

function runController(directory: string, failure = '', source = 'a'.repeat(64), lifetime = 21600) {
  const script = [
    'set -eEuo pipefail',
    'trap \'trap - TERM; kill -TERM -- -$$\' TERM',
    'instance_ids=(i-first i-second)',
    'state_file="$DEPLOY_DIR/state.json"',
    'state_object=oss://private/active-state.json',
    'state_probe_status=1; state_probe=StatusCode=404',
    'if [ -f "$DEPLOY_DIR/durable.json" ]; then state_probe_status=0; state_probe=$(cat "$DEPLOY_DIR/durable.json"); fi',
    'state_resolved=0',
    'PLATFORM_CREDENTIALS_EXPIRE_AT=$(($(date +%s) + LIFETIME))',
    'PLATFORM_SIGNED_URLS_EXPIRE_AT=$PLATFORM_CREDENTIALS_EXPIRE_AT',
    'aliyun() {',
    '  if [ "$2" = cp ]; then',
    '    if [ "$4" = "$state_object" ]; then cp "$3" "$DEPLOY_DIR/durable.json"; else cp "$3" "$DEPLOY_DIR/committed.json"; fi',
    '  else return 1; fi',
    '}',
    'remote_action() {',
    '  printf \'%s:%s\\n\' "$1" "$3" >> "$DEPLOY_DIR/actions"',
    '  [ "$FAILURE" != "$1:$3" ] || return 1',
    '  predecessor=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '  if [ "$FAILURE" = foreign-generation ] && [ "$3" = membership-fence ]; then predecessor=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc; fi',
    '  jq -nc --arg transaction "$DSH_MEMBERSHIP_TRANSACTION" --arg instance "$1" --arg predecessor "$predecessor" \\',
    '    \'{transaction:$transaction,instanceId:$instance,predecessorId:$predecessor,runtimeEnvDigest:"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}\' > "$4"',
    '}',
    'platform_public_readiness() { echo public >> "$DEPLOY_DIR/actions"; [ "$FAILURE" != public ]; }',
    controller,
    'platform_membership_cutover',
    'test "$state_resolved" = 1',
  ].join('\n')
  return spawnSync('bash', ['-c', script], { encoding: 'utf8', timeout: 55_000, killSignal: 'SIGTERM', env: {
    PATH: process.env.PATH,
    DEPLOY_DIR: directory, FAILURE: failure, LIFETIME: String(lifetime),
    PLATFORM_CANDIDATE_SHA: '1'.repeat(40), IMAGE: `ghcr.io/example/repo/platform@sha256:${'2'.repeat(64)}`,
    PLATFORM_MEMBERSHIP_SOURCE_SHA256: source,
    PLATFORM_MEMBERSHIP_PREDECESSOR_IMAGE: `ghcr.io/example/repo/platform@sha256:${'3'.repeat(64)}`,
    PLATFORM_MEMBERSHIP_PREDECESSOR_SHA: '4'.repeat(40),
    PLATFORM_MEMBERSHIP_DEADLINE_SECONDS: '3600',
    PLATFORM_ALIYUN_REGION: 'cn-hangzhou', PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT: 'oss-cn-hangzhou.aliyuncs.com',
    PLATFORM_OSS_BUCKET: 'private', PLATFORM_DEPLOY_OSS_OBJECT_PREFIX: 'deployment',
  } })
}

function fixture(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-membership-deployment-'))
  try { run(directory) } finally { rmSync(directory, { recursive: true, force: true }) }
}

function actions(directory: string): string[] {
  return existsSync(join(directory, 'actions')) ? readFileSync(join(directory, 'actions'), 'utf8').trim().split('\n') : []
}

describe('First membership cutover controller', { timeout: 60_000 }, () => {
  it.each(['i-first:membership-fence', 'i-second:membership-fence', 'i-first:membership-capture', 'i-second:membership-capture', 'foreign-generation'])(
    'retains the unresolved transaction without importing after %s', (failure) =>{  fixture((directory) => {
      const result = runController(directory, failure)
      expect(result.status).not.toBe(0)
      expect(actions(directory).some(action => action.endsWith(':membership-import'))).toBe(false)
      expect(actions(directory).some(action => action.includes('rollback'))).toBe(false)
    }) },
  )

  it('imports only after both captures and verifies the shared source before boot', () =>{  fixture((directory) => {
    const result = runController(directory)
    expect(result.status, result.stderr).toBe(0)
    const events = actions(directory)
    expect(events.indexOf('i-first:membership-import')).toBeGreaterThan(events.indexOf('i-second:membership-capture'))
    expect(events.indexOf('i-first:membership-start-candidate')).toBeGreaterThan(events.indexOf('i-second:membership-verify-import'))
    expect(events.indexOf('i-first:membership-activate')).toBeGreaterThan(events.indexOf('i-second:membership-start-candidate'))
    expect(events.indexOf('i-first:membership-commit')).toBeGreaterThan(events.indexOf('public'))
    expect(JSON.parse(readFileSync(join(directory, 'committed.json'), 'utf8'))).toMatchObject({ phase: 'committed' })
  }) })

  it('resumes the same imported transaction without recapturing or restoring file state', () =>{  fixture((directory) => {
    expect(runController(directory, 'i-second:membership-start-candidate').status).not.toBe(0)
    writeFileSync(join(directory, 'actions'), '')
    const resumed = runController(directory)
    expect(resumed.status, resumed.stderr).toBe(0)
    expect(actions(directory)).not.toContain('i-first:membership-import')
    expect(actions(directory)).not.toContain('i-first:membership-fence')
  }) })

  it('rejects a changed approved source before any re-entry host action', () =>{  fixture((directory) => {
    expect(runController(directory, 'i-second:membership-fence').status).not.toBe(0)
    writeFileSync(join(directory, 'actions'), '')
    const result = runController(directory, '', 'e'.repeat(64))
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('identity differs')
    expect(actions(directory)).toEqual([''])
  }) })

  it.each(['i-second:membership-activate', 'public'])(
    'never restores old file writers after activation failure %s', (failure) =>{  fixture((directory) => {
      const result = runController(directory, failure)
      expect(result.status).not.toBe(0)
      expect(actions(directory).some(action => action.includes('rollback') || action.includes('membership-commit'))).toBe(false)
      expect(JSON.parse(readFileSync(join(directory, 'durable.json'), 'utf8'))).toMatchObject({ phase: 'activating' })
    }) },
  )

  it('rejects a maintenance budget longer than the remaining credentials before any host action', () =>{  fixture((directory) => {
    const result = runController(directory, '', 'a'.repeat(64), 3000)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('remaining credential')
    expect(actions(directory)).toEqual([])
  }) })

  it('keeps release, master and immutable candidate verification around the explicit maintenance mode', () => {
    expect(workflow.on.workflow_dispatch.inputs.membership_cutover).toMatchObject({ default: false })
    const validate = workflow.jobs.validate?.steps.map(step => step.run ?? '').join('\n') ?? ''
    expect(validate).toContain('git merge-base --is-ancestor "$CURRENT_WORKFLOW_SHA" refs/remotes/origin/master')
    expect(validate).toContain('git merge-base --is-ancestor "$PLATFORM_CANDIDATE_SHA" refs/remotes/origin/master')
    expect(validate).toContain('MEMBERSHIP_DEADLINE_SECONDS < 21600')
    const step = workflow.jobs.validate?.steps.find(step => step.name === 'Reject simultaneous deploy and recovery')?.run
    if (step === undefined) throw new Error('deployment mode validation is required')
    for (const override of [{ DEPLOY: 'false' }, { RECOVER: 'true' }, { BOOTSTRAP: 'true' }, { PUBLISH_RELEASE: 'true' }, { PLATFORM_MEMBERSHIP_BACKEND: 'file' }]) {
      const result = spawnSync('bash', ['-e', '-c', step], { encoding: 'utf8', env: {
        PATH: process.env.PATH, MEMBERSHIP_CUTOVER: 'true', DEPLOY: 'true', RECOVER: 'false', BOOTSTRAP: 'false',
        PUBLISH_RELEASE: 'false', PUBLISH_ONLY: 'false', PLATFORM_MEMBERSHIP_BACKEND: 'postgres', PLATFORM_REMOTE_ATTACHMENT_STORAGE: 'oss',
        MEMBERSHIP_SOURCE_SHA256: 'a'.repeat(64), MEMBERSHIP_PREDECESSOR_SHA: 'b'.repeat(40),
        MEMBERSHIP_PREDECESSOR_IMAGE: `ghcr.io/example/repo/platform@sha256:${'c'.repeat(64)}`,
        MEMBERSHIP_DEADLINE_SECONDS: '3600', BOOTSTRAP_EIP_ADDRESSES: '', DEPLOYMENT_RUN_ID: '', ...override,
      } })
      expect(result.status).not.toBe(0)
    }
  })
})
