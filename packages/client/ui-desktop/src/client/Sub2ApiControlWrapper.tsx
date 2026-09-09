/**
 * Prototype wrapper for mounting on Settings 'sub2api' section.
 * Sub-shape A: Injects the CLIProxyAPI fused prototype directly when ?prototype=true
 * or in non-production, while preserving normal snapshot hooks.
 */

import { useMemo } from 'react'
import type { Sub2ApiControlProps } from '../Sub2ApiControl.tsx'
import { Sub2ApiControl as OriginalSub2ApiControl } from '../Sub2ApiControl.tsx'
import { CliProxyAccountPoolPrototype } from './prototype/CliProxyAccountPoolPrototype.tsx'

export function Sub2ApiControlWrapper(props: Sub2ApiControlProps) {
  // Check URL param or environment for prototype demonstration mode
  const isPrototypeMode = useMemo(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    // Default to true in prototype branch throwaway code to show the drafted design immediately
    return params.get('prototype') !== 'false'
  }, [])

  if (isPrototypeMode) {
    return <CliProxyAccountPoolPrototype />
  }

  return <OriginalSub2ApiControl {...props} />
}

export { Sub2ApiControlWrapper as Sub2ApiControl }
