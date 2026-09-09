// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BrandSeat } from '../src/client/BrandSeat.tsx'

const useResource = (() => ({
  status: 'none' as const, value: undefined, failure: undefined, reload: () => {},
})) as import('@deepseek-ai/dsh-client-ui-slots').GlobalStandardProps['useResource']

describe('BrandSeat', () => {
  it('renders the GESTALT plate', () => {
    const { container } = render(
      <BrandSeat
        useResource={useResource}
        useSessions={(() => { throw new Error('unused') })}
        useSessionPendingInteraction={(() => { throw new Error('unused') })}
        useWorkspaces={(() => { throw new Error('unused') })}
      />,
    )
    const wordmark = container.querySelector('svg')
    expect(wordmark?.getAttribute('viewBox')).toBe('26 0 156 24')
    expect(wordmark?.querySelectorAll('path').length).toBeGreaterThan(8)
    expect(wordmark?.querySelector('rect[x="129.348"]')).not.toBeNull()
    expect(wordmark?.querySelector('text')?.textContent).toBe('GESTALT')
    expect(Number(wordmark?.getAttribute('viewBox')?.split(' ')[0])).toBeGreaterThan(23.16)
  })
})
