import { describe, expect, it } from 'vitest'
import { builtDeclarationPath } from './doc-typecheck-paths.ts'

describe('builtDeclarationPath', () => {
  it('maps package source directories and exact entry files to built declarations', () => {
    expect(builtDeclarationPath('./packages/*/*/src')).toBe('./packages/*/*/lib/types')
    expect(builtDeclarationPath('./packages/runtime-diagnostics/invariants/src/index.ts'))
      .toBe('./packages/runtime-diagnostics/invariants/lib/types/index.d.ts')
    expect(builtDeclarationPath('./packages/core/session/src/invariant.ts'))
      .toBe('./packages/core/session/lib/types/invariant.d.ts')
  })

  it('preserves app source and test directories under an app-root declaration build', () => {
    expect(builtDeclarationPath('./apps/desktop/src/companion-product.ts'))
      .toBe('./apps/desktop/lib/types/src/companion-product.d.ts')
    expect(builtDeclarationPath('./apps/mobile/src/MobileBrowse.tsx'))
      .toBe('./apps/mobile/lib/types/src/MobileBrowse.d.ts')
    expect(builtDeclarationPath('./apps/mobile/tests/fixtures/development-keyless-pairing.fixture.ts'))
      .toBe('./apps/mobile/lib/types/tests/fixtures/development-keyless-pairing.fixture.d.ts')
  })

  it('rejects aliases without a supported source target', () => {
    expect(() => builtDeclarationPath('./packages/runtime-diagnostics/invariants/source/index.ts'))
      .toThrow('cannot map workspace source path')
  })
})
