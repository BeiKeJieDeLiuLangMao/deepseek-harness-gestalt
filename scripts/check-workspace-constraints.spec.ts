/** Experimental-package publication and dependency constraints. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  checkExperimentalDependencyIsolation,
  checkExperimentalManifest,
  checkPnpmBuildPolicy,
  checkWorkspaceManifest,
  expectedDshPackageFiles,
  type PackageManifest,
  type WorkspaceManifest,
} from './check-workspace-constraints.ts'

const webserverManifest = JSON.parse(readFileSync(
  new URL('../packages/host/webserver/package.json', import.meta.url),
  'utf8',
)) as PackageManifest

function publicationFileErrors(manifest: PackageManifest): string[] {
  return checkWorkspaceManifest({ dir: 'packages/host/webserver', manifest })
    .filter(error => error.includes('package.json files must be'))
}

const webserverFilesError = 'packages/host/webserver/package.json: '
  + '@deepseek-ai/dsh-host-webserver: package.json files must be ["lib/index.js","lib/http.js","lib/types/**/*.d.ts"]'

const experimental: WorkspaceManifest = {
  dir: 'packages/experimental/prototype',
  manifest: { name: '@deepseek-ai/dsh-experimental-prototype', private: true },
}

describe('experimental workspace constraints', () => {
  it('requires the experimental package-name prefix', () => {
    expect(checkExperimentalManifest({
      ...experimental,
      manifest: { ...experimental.manifest, name: '@deepseek-ai/dsh-prototype' },
    })).toEqual([
      '@deepseek-ai/dsh-prototype: experimental package name must start with "@deepseek-ai/dsh-experimental-"',
    ])
  })

  it('requires private manifests without publication metadata', () => {
    expect(checkExperimentalManifest(experimental)).toEqual([])
    expect(checkExperimentalManifest({
      ...experimental,
      manifest: { ...experimental.manifest, private: false, publishConfig: { access: 'public' } },
    })).toEqual([
      '@deepseek-ai/dsh-experimental-prototype: experimental package must set "private": true',
      '@deepseek-ai/dsh-experimental-prototype: experimental package must omit publishConfig',
    ])
  })

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'] as const)(
    'rejects release %s on an experimental package',
    (section) => {
      expect(checkExperimentalDependencyIsolation([experimental, {
        dir: 'packages/core/consumer',
        manifest: {
          name: '@deepseek-ai/dsh-consumer',
          [section]: { '@deepseek-ai/dsh-experimental-prototype': 'workspace:^' },
        },
      }])).toEqual([
        `@deepseek-ai/dsh-consumer: ${section}.@deepseek-ai/dsh-experimental-prototype must not reference an experimental package`,
      ])
    },
  )

  it('allows development and experimental consumers but rejects the Python release runtime', () => {
    const manifests: WorkspaceManifest[] = [experimental, {
      dir: 'packages/core/test-only',
      manifest: {
        name: '@deepseek-ai/dsh-test-only',
        devDependencies: { '@deepseek-ai/dsh-experimental-prototype': 'workspace:^' },
      },
    }, {
      dir: 'packages/experimental/consumer',
      manifest: {
        name: '@deepseek-ai/dsh-experimental-consumer',
        dependencies: { '@deepseek-ai/dsh-experimental-prototype': 'workspace:^' },
      },
    }, {
      dir: 'python/sdk-runtime',
      manifest: {
        name: '@deepseek-ai/dsh-python-runtime',
        dependencies: { '@deepseek-ai/dsh-experimental-prototype': 'workspace:^' },
      },
    }]

    expect(checkExperimentalDependencyIsolation(manifests)).toEqual([
      '@deepseek-ai/dsh-python-runtime: dependencies.@deepseek-ai/dsh-experimental-prototype must not reference an experimental package',
    ])
  })
})

describe('pnpm build-script policy', () => {
  it('requires explicit boolean decisions', () => {
    expect(checkPnpmBuildPolicy({ allowBuilds: { electron: true, coreJs: false } })).toEqual([])
    expect(checkPnpmBuildPolicy({ allowBuilds: { electron: 'set this to true or false' } })).toEqual([
      'pnpm-workspace.yaml: allowBuilds.electron must be true or false, got "set this to true or false"',
    ])
  })
})

describe('package payload constraints', () => {
  it('includes a declared profile patch without a package-name allowlist', () => {
    expect(expectedDshPackageFiles({
      name: '@deepseek-ai/dsh-private-profile',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    })).toEqual([
      'lib/index.js',
      'cordis.patch.yml',
      'lib/types/**/*.d.ts',
    ])
  })

  it('publishes the locale chunk beside the other better-sidebar lazy chunks', () => {
    expect(expectedDshPackageFiles({
      name: '@deepseek-ai/dsh-client-ui-better-sidebar',
      exports: {
        './invariant': { types: './lib/types/invariant.d.ts', default: './lib/invariant.js' },
        './client': { default: './lib/client.js' },
      },
    })).toEqual([
      'lib/index.js',
      'lib/invariant.js',
      'lib/client.js',
      'lib/client-terminal.js',
      'lib/client-editor.js',
      'lib/client-mermaid.js',
      'lib/client-locale.js',
      'lib/types/**/*.d.ts',
    ])
  })

  it('derives the webserver public HTTP runtime from its export', () => {
    expect(expectedDshPackageFiles(webserverManifest)).toEqual([
      'lib/index.js',
      'lib/http.js',
      'lib/types/**/*.d.ts',
    ])
    expect(publicationFileErrors(webserverManifest)).toEqual([])
  })

  it('derives supported string export entries', () => {
    expect(expectedDshPackageFiles({
      exports: { './http': './lib/http.js' },
    })).toEqual([
      'lib/index.js',
      'lib/http.js',
      'lib/types/**/*.d.ts',
    ])
  })

  it('rejects a missing public runtime', () => {
    expect(publicationFileErrors({
      ...webserverManifest,
      files: ['lib/index.js', 'lib/types/**/*.d.ts'],
    })).toEqual([webserverFilesError])
  })

  it('rejects an extra publication file', () => {
    expect(publicationFileErrors({
      ...webserverManifest,
      files: [...(webserverManifest.files ?? []), 'lib/unused.js'],
    })).toEqual([webserverFilesError])
  })
})
