import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { desktopIconOptions } from '../src/app-icon.ts'

const desktopRoot = join(process.cwd(), 'apps/desktop')

const expectedIcons = {
  'icon.icns': 'da6a1174df80af2efadf763b22f8bc37f355680f8315f9ab78a8c59991c60e25',
  'icon.ico': '46a26b6a0e98e4a96e6151d7627b3a779af57c9214ff960a8447c618cfd88387',
  'icon.png': '8eb4eb7cc767a5d929fee6715e78d5360ebca184996d757ffef18db90319c802',
} as const

function icon(name: keyof typeof expectedIcons): Buffer {
  return readFileSync(join(desktopRoot, 'build', name))
}

describe('Desktop application icons', () => {
  it('owns the exact production artwork from the Gestalt source checkout', () => {
    for (const [name, expected] of Object.entries(expectedIcons)) {
      expect(createHash('sha256').update(icon(name as keyof typeof expectedIcons)).digest('hex'))
        .toBe(expected)
    }

    expect(icon('icon.icns').subarray(0, 4).toString('ascii')).toBe('icns')
    expect(icon('icon.ico').readUInt16LE(0)).toBe(0)
    expect(icon('icon.ico').readUInt16LE(2)).toBe(1)
    expect(icon('icon.png').subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(icon('icon.png').readUInt32BE(16)).toBe(512)
    expect(icon('icon.png').readUInt32BE(20)).toBe(512)
    expect(icon('icon.png').readUInt8(24)).toBe(8)
    expect(icon('icon.png').readUInt8(25)).toBe(6)
  })

  it('wires each platform build and the runtime PNG explicitly', () => {
    const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')) as {
      build: {
        extraResources: Array<{ from: string; to: string }>
        mac: { icon?: string }
        win: {
          icon?: string
          signExecutable?: boolean
          signAndEditExecutable?: boolean
        }
      }
    }

    expect(manifest.build.mac.icon).toBe('build/icon.icns')
    expect(manifest.build.win.icon).toBe('build/icon.ico')
    expect(manifest.build.win.signExecutable).toBe(false)
    expect(manifest.build.win).not.toHaveProperty('signAndEditExecutable')
    expect(manifest.build.extraResources).toContainEqual({ from: 'build/icon.png', to: 'icon.png' })

    const main = readFileSync(join(desktopRoot, 'src/main.ts'), 'utf8')
    expect(main).toContain('...desktopIconOptions({')
    expect(main).toContain('setDockIcon: (path) => { app.dock.setIcon(path) }')
  })

  it('uses the PNG for the development Dock and Windows runtime window', () => {
    const dockIcons: string[] = []
    const setDockIcon = (path: string): void => { dockIcons.push(path) }

    // The product joins paths with the host separator; expectations follow
    // the same platform path semantics instead of hardcoding `/`.
    expect(desktopIconOptions({
      platform: 'darwin',
      packaged: false,
      appPath: '/desktop',
      resourcesPath: '/resources',
      setDockIcon,
    })).toEqual({})
    expect(dockIcons).toEqual([join('/desktop', 'build', 'icon.png')])

    expect(desktopIconOptions({
      platform: 'darwin',
      packaged: true,
      appPath: '/desktop',
      resourcesPath: '/resources',
      setDockIcon,
    })).toEqual({})
    expect(dockIcons).toHaveLength(1)

    expect(desktopIconOptions({
      platform: 'win32',
      packaged: true,
      appPath: '/desktop',
      resourcesPath: '/resources',
      setDockIcon,
    })).toEqual({ icon: join('/resources', 'icon.png') })
    expect(desktopIconOptions({
      platform: 'win32',
      packaged: false,
      appPath: '/desktop',
      resourcesPath: '/resources',
      setDockIcon,
    })).toEqual({ icon: join('/desktop', 'build', 'icon.png') })
  })
})
