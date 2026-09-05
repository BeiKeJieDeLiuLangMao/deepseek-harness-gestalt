import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { materializeProfilePatch } from '../src/launcher.ts'

const launcherDir = dirname(fileURLToPath(new URL('../src/launcher.ts', import.meta.url)))
const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).reverse().map(dir => rm(dir, { recursive: true, force: true })))
})

function uniquePackageName(): string {
  return `dsh-snap-launch-${randomUUID()}`
}

async function registerDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  created.push(dir)
  return dir
}

async function tempRoot(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

async function writePackage(dir: string, name: string, marker: string): Promise<string> {
  await registerDir(dir)
  await writeFile(join(dir, 'package.json'), `${JSON.stringify({ name, version: '0.0.0', marker })}\n`)
  return realpath(dir)
}

async function writePatch(dir: string, packageName: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'overlay.cordis.yml')
  await writeFile(path, `- name: ${JSON.stringify(packageName)}\n`)
  return path
}

function profileLink(cwd: string, packageName: string): string {
  return join(cwd, '.dsh', 'profiles', 'node_modules', ...packageName.split('/'))
}

describe('materializeProfilePatch dual-anchor linking', () => {
  it('links from the harness source when the patch directory cannot see the package', async () => {
    const packageName = uniquePackageName()
    const expected = await writePackage(join(launcherDir, 'node_modules', packageName), packageName, 'harness')
    const cwd = await tempRoot('dsh-snap-launch-harness-')
    const patchDir = join(cwd, 'patches')
    const source = await writePatch(patchDir, packageName)
    const targetDir = join(cwd, 'materialized')
    await mkdir(targetDir, { recursive: true })

    materializeProfilePatch(source, cwd, targetDir, 0)

    expect(await realpath(profileLink(cwd, packageName))).toBe(expected)
  })

  it('prefers the package beside the patch when both anchors resolve', async () => {
    const packageName = uniquePackageName()
    await writePackage(join(launcherDir, 'node_modules', packageName), packageName, 'harness')
    const cwd = await tempRoot('dsh-snap-launch-prefer-')
    const patchDir = join(cwd, 'patches')
    const expected = await writePackage(
      join(patchDir, 'node_modules', packageName),
      packageName,
      'patch',
    )
    const source = await writePatch(patchDir, packageName)
    const targetDir = join(cwd, 'materialized')
    await mkdir(targetDir, { recursive: true })

    materializeProfilePatch(source, cwd, targetDir, 0)

    const linked = profileLink(cwd, packageName)
    expect(await realpath(linked)).toBe(expected)
    expect(JSON.parse(await readFile(join(linked, 'package.json'), 'utf8')).marker).toBe('patch')
  })

  it('leaves an unresolved bare name for installation heal instead of throwing', async () => {
    const packageName = uniquePackageName()
    const cwd = await tempRoot('dsh-snap-launch-miss-')
    const source = await writePatch(join(cwd, 'patches'), packageName)
    const targetDir = join(cwd, 'materialized')
    await mkdir(targetDir, { recursive: true })

    const target = materializeProfilePatch(source, cwd, targetDir, 0)

    expect(existsSync(target)).toBe(true)
    expect(existsSync(profileLink(cwd, packageName))).toBe(false)

    const installPkg = await writePackage(join(cwd, 'install-closure', packageName), packageName, 'install')
    const link = profileLink(cwd, packageName)
    await mkdir(dirname(link), { recursive: true })
    await symlink(installPkg, link, process.platform === 'win32' ? 'junction' : 'dir')
    expect(await realpath(link)).toBe(installPkg)
  })

  it('rejects an existing profile link that points at a different package directory', async () => {
    const packageName = uniquePackageName()
    const cwd = await tempRoot('dsh-snap-launch-conflict-')
    const patchDir = join(cwd, 'patches')
    await writePackage(join(patchDir, 'node_modules', packageName), packageName, 'patch')
    const other = await writePackage(join(cwd, 'other-conflict-anchor'), packageName, 'other')
    const link = profileLink(cwd, packageName)
    await mkdir(dirname(link), { recursive: true })
    await symlink(other, link, process.platform === 'win32' ? 'junction' : 'dir')
    const source = await writePatch(patchDir, packageName)
    const targetDir = join(cwd, 'materialized')
    await mkdir(targetDir, { recursive: true })

    expect(() => materializeProfilePatch(source, cwd, targetDir, 0))
      .toThrow(`snapshot profile package ${packageName} resolves to two directories`)
  })
})
