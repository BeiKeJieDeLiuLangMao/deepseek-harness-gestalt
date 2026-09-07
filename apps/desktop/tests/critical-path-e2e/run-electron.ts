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
import {
  assertProcessesExited, cleanEnvironment, runLogged, terminateProcesses,
} from '../electron-runner-infrastructure.ts'
import { readOptionalFile, readProcessEvidence, type PhaseProcessEvidence } from './artifact-io.ts'
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
const artifactRoot = process.env.DSH_CRITICAL_PATH_ELECTRON_ARTIFACTS
  ?? join(repoRoot, '.artifacts', 'critical-path-electron', `${stamp}-${shortHead}`)
await mkdir(artifactRoot, { recursive: true })

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
      result.recordedPids = pidsOf(processEntry)
      completeProcessEvidence = processEntry?.electronPid !== undefined
        && processEntry.hostPid !== undefined
      if (result.recordedPids.length > 0) {
        try {
          await assertProcessesExited(result.recordedPids)
        } catch (processLeakFailure) {
          phaseFailures.push(processLeakFailure)
          await terminateProcesses(result.recordedPids)
        }
        for (const pid of result.recordedPids) verifiedExitedProcesses.add(processKey(phase, pid))
        result.processesExited = true
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
    const remaining = phases.flatMap(phase => pidsOf(recorded[phase])
      .filter(pid => !verifiedExitedProcesses.has(processKey(phase, pid)))
      .map(pid => ({ phase, pid })))
    await terminateProcesses(remaining.map(entry => entry.pid))
    for (const entry of remaining) verifiedExitedProcesses.add(processKey(entry.phase, entry.pid))
    for (const result of phaseResults) {
      if (result.recordedPids.length === 0) result.recordedPids = pidsOf(recorded[result.phase])
      if (result.recordedPids.every(pid => verifiedExitedProcesses.has(processKey(result.phase, pid)))) {
        result.processesExited = result.recordedPids.length > 0
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
  await retainResultManifest(currentFailures(failure, cleanupFailures), cleanupFailures)
  process.stdout.write(`Critical-path Electron artifacts: ${artifactRoot}\n`)
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
      failures: failures.map(failureSummary),
    }, undefined, 2) + '\n')
  } catch (resultEvidenceFailure) {
    cleanupFailures.push(resultEvidenceFailure)
  }
}

function currentFailures(failure: unknown, cleanupFailures: readonly unknown[]): unknown[] {
  return [...failure === undefined ? [] : [failure], ...cleanupFailures]
}

function failureSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'Error', message: String(error) }
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
  const value = JSON.parse(text) as Partial<TestResultEvidence>
  if (typeof value.title !== 'string' || value.title.length === 0) {
    throw new TypeError(`critical-path ${phase} test result has no title`)
  }
  for (const field of ['tests', 'passed', 'failed', 'skipped'] as const) {
    if (!Number.isInteger(value[field]) || (value[field] as number) < 0) {
      throw new TypeError(`critical-path ${phase} test result ${field} must be a non-negative integer`)
    }
  }
  return value as TestResultEvidence
}

function pidsOf(evidence: PhaseProcessEvidence | undefined): number[] {
  if (evidence === undefined) return []
  return [...new Set([evidence.electronPid, evidence.hostPid].filter(pid => pid !== undefined))]
}

function processKey(phase: CriticalPathPhase, pid: number): string {
  return `${phase}:${String(pid)}`
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
