#!/usr/bin/env node
/** Build current source once and run the create, restore, and archive Electron phases. */

import { execFile } from 'node:child_process'
import {
  access, mkdir, mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises'
import { platform, release, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { ProcessIdentity } from '@deepseek-ai/dsh-subprocess-local/src/process-inspector.ts'
import {
  assertOwnedProcessesExited, cleanEnvironment, runLogged, terminateOwnedProcesses,
} from '../electron-runner-infrastructure.ts'
import {
  readOptionalFile,
  readProcessEvidence,
  redactArtifactDiagnostic,
  removeSecretBearingArtifacts,
  type PhaseProcessEvidence,
} from './artifact-io.ts'
import {
  PARENT_MODEL, SIDE_MODEL, startKeylessModelProvider, TITLE_MODEL, type CriticalPathPhase,
} from './keyless-model.ts'

const execute = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '..', '..')
const repoRoot = resolve(desktopRoot, '..', '..')
const head = (await execute('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim()
const shortHead = head.slice(0, 12)
const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
const artifactBase = process.env.DSH_CRITICAL_PATH_ELECTRON_ARTIFACTS
  ?? join(repoRoot, '.artifacts', 'critical-path-electron')
await mkdir(artifactBase, { recursive: true, mode: 0o700 })
const artifactRoot = await mkdtemp(join(artifactBase, `${stamp}-${shortHead}-`))
const secretValues = ambientSecretValues(process.env)

const phases: readonly CriticalPathPhase[] = ['create', 'restore', 'archive']
const buildResults: Array<{
  command: string
  args: readonly string[]
  cwd: string
  exitCode: number
  logFile: string
}> = []
interface PhaseResult {
  phase: CriticalPathPhase
  exitCode: number | null
  tests: number
  passed: number
  failed: number
  skipped: number
  recordedPids: number[]
  processesExited: boolean
}

interface TestResultEvidence {
  title: string
  tests: number
  passed: number
  failed: number
  skipped: number
}

const phaseResults: PhaseResult[] = []
const verifiedExitedProcesses = new Set<string>()
let runtimeRoot: string | undefined
let model: Awaited<ReturnType<typeof startKeylessModelProvider>> | undefined
let failure: unknown
let versions: { electron: string; webdriverio: string } | undefined
let artifactsShareable = true

try {
  if (process.platform === 'linux' && process.env.DISPLAY === undefined) {
    throw new Error('Critical-path Electron acceptance requires a visible DISPLAY on Linux')
  }
  await assertSourceUnchanged()
  const packageJson = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>
  }
  const electron = packageJson.devDependencies.electron
  const webdriverio = packageJson.devDependencies.webdriverio
  if (electron === undefined || webdriverio === undefined) {
    throw new Error('Desktop package metadata exposes no Electron or WebdriverIO version')
  }
  versions = { electron, webdriverio }
  runtimeRoot = await mkdtemp(join(tmpdir(), 'dsh-critical-path-electron-'))
  const dshHome = join(runtimeRoot, 'dsh-home')
  const userData = join(runtimeRoot, 'user-data')
  const workspace = join(runtimeRoot, 'workspace')
  const operatedConfig = join(runtimeRoot, 'operated-platform.json')
  await Promise.all([
    mkdir(dshHome, { recursive: true, mode: 0o700 }),
    mkdir(userData, { recursive: true, mode: 0o700 }),
    mkdir(workspace, { recursive: true, mode: 0o700 }),
  ])
  await initializeWorkspace(workspace)
  await writeHarnessHome(dshHome)
  await writeOperatedConfig(operatedConfig)
  model = await startKeylessModelProvider()

  const commands: Array<{ command: string; args: string[]; cwd: string }> = [
    { command: 'pnpm', args: ['run', 'build:lib:host'], cwd: repoRoot },
    { command: 'pnpm', args: ['run', 'build:lib:client'], cwd: repoRoot },
    { command: 'pnpm', args: ['run', 'build:web'], cwd: repoRoot },
    {
      command: process.execPath,
      args: [join(desktopRoot, 'scripts', 'build-main.mjs'), operatedConfig],
      cwd: desktopRoot,
    },
  ]
  for (const [index, item] of commands.entries()) {
    const logFile = join(artifactRoot, `build-${String(index)}.log`)
    const exitCode = await runLogged(item.command, item.args, {
      cwd: item.cwd,
      env: cleanEnvironment(process.env),
      logFile,
    })
    buildResults.push({ ...item, exitCode, logFile })
    await writeBuildSource()
    if (exitCode !== 0) {
      throw new Error(`${item.command} ${item.args.join(' ')} exited ${String(exitCode)}`)
    }
  }

  const wdioBin = join(desktopRoot, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js')
  await access(wdioBin)
  for (const phase of phases) {
    const result: PhaseResult = {
      phase,
      exitCode: null,
      tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      recordedPids: [],
      processesExited: false,
    }
    phaseResults.push(result)
    const phaseRoot = join(artifactRoot, phase)
    const smokeFile = join(phaseRoot, 'desktop.log')
    const profile = join(runtimeRoot, `profile-${phase}.json`)
    await mkdir(phaseRoot, { recursive: true })
    await writeFile(smokeFile, '')
    await writeFile(profile, JSON.stringify({
      DSH_HOME: dshHome,
      DSH_DESKTOP_SMOKE_FILE: smokeFile,
    }, undefined, 2) + '\n', { mode: 0o600 })
    model.beginPhase(phase)
    const env = {
      ...cleanEnvironment(process.env),
      DSH_DESKTOP_E2E: '1',
      DSH_DESKTOP_E2E_DIRECT_NETWORK: '1',
      DSH_NODE: process.execPath,
      TSX_TSCONFIG_PATH: join(repoRoot, 'tsconfig.json'),
      DEEPSEEK_API_KEY: 'keyless-critical-path-electron',
      DEEPSEEK_BASE_URL: model.origin,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
      DSH_CRITICAL_PATH_PHASE: phase,
      DSH_CRITICAL_PATH_PROFILE: profile,
      DSH_CRITICAL_PATH_USER_DATA: userData,
      DSH_CRITICAL_PATH_WORKSPACE: workspace,
      DSH_CRITICAL_PATH_DSH_HOME: dshHome,
      DSH_CRITICAL_PATH_SMOKE_FILE: smokeFile,
      DSH_CRITICAL_PATH_ARTIFACT_DIR: artifactRoot,
    }
    result.exitCode = await runLogged(
      process.execPath,
      [wdioBin, 'run', join(here, 'wdio.conf.ts')],
      { cwd: desktopRoot, env, logFile: join(phaseRoot, 'runner.log') },
    )
    const phaseFailures: unknown[] = []
    let completeProcessEvidence = false
    try {
      const testResult = await readPhaseTestResult(phase)
      if (testResult !== undefined) {
        Object.assign(result, {
          tests: testResult.tests,
          passed: testResult.passed,
          failed: testResult.failed,
          skipped: testResult.skipped,
        })
      }
    } catch (testEvidenceFailure) {
      phaseFailures.push(testEvidenceFailure)
    }
    try {
      const processEntry = (await readProcessEvidence(artifactRoot))[phase]
      const identities = identitiesOf(processEntry)
      result.recordedPids = identities.map(identity => identity.pid)
      completeProcessEvidence = processEntry?.electron !== undefined
        && processEntry.host !== undefined
        && identities.length >= 2
      if (identities.length > 0) {
        let exited = false
        try {
          await assertOwnedProcessesExited(identities)
          exited = true
        } catch (processLeakFailure) {
          phaseFailures.push(processLeakFailure)
          try {
            await terminateOwnedProcesses(identities)
            exited = true
          } catch (processTerminationFailure) {
            phaseFailures.push(processTerminationFailure)
          }
        }
        if (exited) {
          for (const identity of identities) verifiedExitedProcesses.add(processKey(phase, identity))
          result.processesExited = true
        }
      }
    } catch (processEvidenceFailure) {
      phaseFailures.push(processEvidenceFailure)
    }
    await writeFile(join(artifactRoot, 'provider-audit.json'), JSON.stringify(model.audit, undefined, 2) + '\n')
    if (result.exitCode !== 0) {
      phaseFailures.push(new Error(`critical-path ${phase} phase exited ${String(result.exitCode)}`))
    }
    if (result.tests !== 1 || result.passed !== 1 || result.failed !== 0 || result.skipped !== 0) {
      phaseFailures.push(new Error(
        `critical-path ${phase} phase did not observe exactly one passing, non-skipped test: ${JSON.stringify(result)}`,
      ))
    }
    if (!completeProcessEvidence) {
      phaseFailures.push(new Error(`critical-path ${phase} phase did not record both Electron and Host processes`))
    }
    throwFailures(phaseFailures, `critical-path ${phase} phase failed`)
  }

  assertProviderAudit(model.audit)
  const evidence = {
    processes: join(artifactRoot, 'processes.json'),
    providerAudit: join(artifactRoot, 'provider-audit.json'),
    sessionState: join(artifactRoot, 'session-state.json'),
    mainSession: join(artifactRoot, 'main-session-evidence.jsonl'),
    childSession: join(artifactRoot, 'child-session-evidence.jsonl'),
  }
  await Promise.all(Object.values(evidence).map(path => access(path)))
} catch (error) {
  failure = error
} finally {
  const cleanupFailures: unknown[] = []
  if (model !== undefined) {
    try {
      await model.close()
    } catch (modelCloseFailure) {
      cleanupFailures.push(modelCloseFailure)
    }
    try {
      await writeFile(join(artifactRoot, 'provider-audit.json'), JSON.stringify(model.audit, undefined, 2) + '\n')
    } catch (auditEvidenceFailure) {
      cleanupFailures.push(auditEvidenceFailure)
    }
  }
  try {
    const recorded = await readProcessEvidence(artifactRoot)
    const remaining = phases.flatMap(phase => identitiesOf(recorded[phase])
      .filter(identity => !verifiedExitedProcesses.has(processKey(phase, identity)))
      .map(identity => ({ phase, identity })))
    await terminateOwnedProcesses(remaining.map(entry => entry.identity))
    for (const entry of remaining) verifiedExitedProcesses.add(processKey(entry.phase, entry.identity))
    for (const result of phaseResults) {
      const identities = identitiesOf(recorded[result.phase])
      if (result.recordedPids.length === 0) result.recordedPids = identities.map(identity => identity.pid)
      if (identities.every(identity => verifiedExitedProcesses.has(processKey(result.phase, identity)))) {
        result.processesExited = identities.length >= 2
      }
    }
  } catch (processCleanupFailure) {
    cleanupFailures.push(processCleanupFailure)
  }
  await retainResultManifest([
    ...currentFailures(failure, cleanupFailures),
    new Error('critical-path scratch cleanup has not completed'),
  ], cleanupFailures)
  if (runtimeRoot !== undefined) {
    try {
      await rm(runtimeRoot, { recursive: true, force: true })
    } catch (runtimeCleanupFailure) {
      cleanupFailures.push(runtimeCleanupFailure)
    }
  }
  try {
    await assertSourceUnchanged()
  } catch (sourceMovementFailure) {
    cleanupFailures.push(sourceMovementFailure)
  }
  try {
    const removed = await removeSecretBearingArtifacts(artifactRoot, secretValues)
    if (removed > 0) {
      cleanupFailures.push(new Error(`retained artifact secret scan removed ${String(removed)} file(s)`))
    }
  } catch (artifactScanFailure) {
    cleanupFailures.push(new Error('retained artifact secret scan failed', { cause: artifactScanFailure }))
    artifactsShareable = false
    try {
      await rm(artifactRoot, { recursive: true, force: true })
      await mkdir(artifactRoot, { mode: 0o700 })
      artifactsShareable = true
    } catch (artifactPurgeFailure) {
      cleanupFailures.push(new Error('unsafe artifact namespace purge failed', { cause: artifactPurgeFailure }))
    }
  }
  await retainResultManifest(currentFailures(failure, cleanupFailures), cleanupFailures)
  if (artifactsShareable) process.stdout.write(`Critical-path Electron artifacts: ${artifactRoot}\n`)
  else process.stderr.write('Critical-path Electron artifacts are unavailable because safe purge failed\n')
  if (failure !== undefined && cleanupFailures.length > 0) {
    throw new AggregateError([failure, ...cleanupFailures], 'Critical-path Electron run and cleanup failed')
  }
  if (failure !== undefined) throw failure
  if (cleanupFailures.length === 1) throw cleanupFailures[0]
  if (cleanupFailures.length > 1) throw new AggregateError(cleanupFailures, 'Critical-path Electron cleanup failed')
}

async function retainResultManifest(
  failures: readonly unknown[],
  cleanupFailures: unknown[],
): Promise<void> {
  try {
    const tests = phaseResults.reduce((count, result) => count + result.tests, 0)
    const passedTests = phaseResults.reduce((count, result) => count + result.passed, 0)
    const skipped = phaseResults.reduce((count, result) => count + result.skipped, 0)
    const failedTests = phaseResults.reduce((count, result) => count + result.failed, 0)
    await writeFile(join(artifactRoot, 'result.json'), JSON.stringify({
      passed: failures.length === 0,
      head,
      os: `${platform()} ${release()}`,
      ...versions,
      buildCommands: buildResults,
      phases: phaseResults,
      tests,
      passedTests,
      failedTests,
      skipped,
      processesExited: phaseResults.length === phases.length
        && phaseResults.every(result => result.processesExited),
      evidence: {
        processes: join(artifactRoot, 'processes.json'),
        providerAudit: join(artifactRoot, 'provider-audit.json'),
        sessionState: join(artifactRoot, 'session-state.json'),
        mainSession: join(artifactRoot, 'main-session-evidence.jsonl'),
        childSession: join(artifactRoot, 'child-session-evidence.jsonl'),
      },
      failures: failures.map(failure => failureSummary(failure, secretValues)),
    }, undefined, 2) + '\n')
  } catch (resultEvidenceFailure) {
    cleanupFailures.push(resultEvidenceFailure)
  }
}

function currentFailures(failure: unknown, cleanupFailures: readonly unknown[]): unknown[] {
  return [...failure === undefined ? [] : [failure], ...cleanupFailures]
}

function failureSummary(error: unknown, secrets: readonly string[]): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: redactArtifactDiagnostic(error.name, secrets),
      message: redactArtifactDiagnostic(error.message, secrets),
    }
  }
  return { name: 'Error', message: redactArtifactDiagnostic(String(error), secrets) }
}

function throwFailures(failures: readonly unknown[], message: string): void {
  if (failures.length === 0) return
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, message)
}

async function writeBuildSource(): Promise<void> {
  await writeFile(join(artifactRoot, 'build-source.json'), JSON.stringify({
    head,
    builtAt: new Date().toISOString(),
    commands: buildResults,
  }, undefined, 2) + '\n')
}

async function readPhaseTestResult(phase: CriticalPathPhase): Promise<TestResultEvidence | undefined> {
  const text = await readOptionalFile(join(artifactRoot, phase, 'test-result.json'))
  if (text === undefined) return undefined
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`critical-path ${phase} test result must contain an object`)
  }
  const value = parsed as Record<string, unknown>
  const expectedFields = ['failed', 'passed', 'skipped', 'tests', 'title']
  const unknownField = Object.keys(value).find(field => !expectedFields.includes(field))
  if (unknownField !== undefined) {
    throw new TypeError(`critical-path ${phase} test result contains unknown field ${JSON.stringify(unknownField)}`)
  }
  if (typeof value['title'] !== 'string' || value['title'].length === 0) {
    throw new TypeError(`critical-path ${phase} test result has no title`)
  }
  for (const field of ['tests', 'passed', 'failed', 'skipped'] as const) {
    if (!Number.isSafeInteger(value[field]) || (value[field] as number) < 0) {
      throw new TypeError(`critical-path ${phase} test result ${field} must be a non-negative integer`)
    }
  }
  return {
    title: value['title'],
    tests: value['tests'] as number,
    passed: value['passed'] as number,
    failed: value['failed'] as number,
    skipped: value['skipped'] as number,
  }
}

function identitiesOf(evidence: PhaseProcessEvidence | undefined): ProcessIdentity[] {
  return evidence === undefined ? [] : [...evidence.ownedProcesses ?? []]
}

function processKey(phase: CriticalPathPhase, identity: ProcessIdentity): string {
  return `${phase}:${String(identity.pid)}:${identity.started}`
}

function ambientSecretValues(source: NodeJS.ProcessEnv): string[] {
  return [...new Set(Object.entries(source).flatMap(([name, value]) => (
    /KEY|SECRET|TOKEN|PASSWORD/i.test(name) && value !== undefined && value.length > 0 ? [value] : []
  )))]
}

async function assertSourceUnchanged(): Promise<void> {
  const currentHead = (await execute('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim()
  const worktreeStatus = (await execute('git', ['status', '--porcelain'], { cwd: repoRoot })).stdout.trim()
  if (currentHead !== head || worktreeStatus !== '') {
    throw new Error(
      `Critical-path Electron source changed during acceptance: expected ${head} and clean, observed ${currentHead} and ${worktreeStatus === '' ? 'clean' : 'dirty'}`,
    )
  }
}

function assertProviderAudit(audit: readonly {
  phase: CriticalPathPhase
  path: string
  model: string
}[]): void {
  const expected = [
    { phase: 'create', path: '/chat/completions', model: PARENT_MODEL },
    { phase: 'create', path: '/chat/completions', model: TITLE_MODEL },
    { phase: 'create', path: '/v1/chat/completions', model: SIDE_MODEL },
    { phase: 'restore', path: '/v1/chat/completions', model: SIDE_MODEL },
  ] satisfies Array<{ phase: CriticalPathPhase; path: string; model: string }>
  if (audit.length !== expected.length || expected.some(wanted => audit.filter(entry => (
    entry.phase === wanted.phase && entry.path === wanted.path && entry.model === wanted.model
  )).length !== 1)) {
    throw new Error(`critical-path provider audit did not equal its closed request set: ${JSON.stringify(audit)}`)
  }
}

async function initializeWorkspace(workspace: string): Promise<void> {
  await execute('git', ['init'], { cwd: workspace })
  await writeFile(join(workspace, 'README.md'), '# Critical path Electron workspace\n')
}

async function writeHarnessHome(dshHome: string): Promise<void> {
  await writeFile(join(dshHome, 'cordis.patch.yml'), [
    '- id: session-persistence-jsonl',
    '  config:',
    "    root: !!js dshHomePath('sessions')",
    '    packChunks: false',
    '    compression: none',
    '- id: session-title-llm',
    '  config:',
    '    provider: deepseek-official',
    `    model: ${TITLE_MODEL}`,
    '- id: directory-picker',
    '  disabled: true',
    '- insert:',
    '    - id: directory-picker-browse',
    "      name: '@deepseek-ai/dsh-host-directory-picker-browse'",
    '    - id: ui-directory-picker-browse',
    "      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'",
    '',
  ].join('\n'), { mode: 0o600 })
  await writeFile(join(dshHome, 'settings.yaml'), [
    'ui-onboarding:',
    '  welcomeNoticeVersion: "2026-08-13.1"',
    '',
  ].join('\n'), { mode: 0o600 })
}

async function writeOperatedConfig(path: string): Promise<void> {
  await writeFile(path, JSON.stringify({
    environment: 'production',
    origin: 'https://platform.fixture.example',
    callbackUrl: 'https://platform.fixture.example/v1/account/oauth/github/callback',
    githubClientId: 'critical-path-electron',
    credentialReference: 'credentials://critical-path-electron',
    databaseIdentity: 'critical-path-electron',
    identityNamespace: 'critical-path-electron',
    companionAttachmentHostTimeoutMs: 120_000,
    remoteRelay: {
      url: 'wss://platform.fixture.example/v1/remote-access/relay',
      attachTimeoutMs: 10_000,
      negotiationTimeoutMs: 10_000,
      heartbeatIntervalMs: 30_000,
      reconnectDelayMs: 1_000,
      inboundMaxBytes: 1_048_576,
      inboundMaxMessages: 16,
    },
  }, undefined, 2) + '\n', { mode: 0o600 })
}
