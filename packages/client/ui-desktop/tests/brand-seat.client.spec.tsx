// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BrandSeat } from '../src/client/BrandSeat.tsx'

describe('BrandSeat', () => {
  it('renders the GESTALT plate', () => {
    const { container } = render(
      <BrandSeat
        wide
        useSessions={(() => { throw new Error('unused') })}
        useWorkspaces={(() => { throw new Error('unused') })}
      />,
    )
    expect(container.textContent).toContain('GESTALT')
  })
})
