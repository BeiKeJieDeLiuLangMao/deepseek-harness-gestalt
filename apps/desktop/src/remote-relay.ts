/** Desktop Host composition for the product-gated Remote Relay endpoint. */

import type { SelectedPlatformEnvironment } from '@deepseek-ai/dsh-platform-account'
import { REMOTE_PROTOCOL_LIMITS } from '@deepseek-ai/dsh-remote-protocol'
import type { RelayEndpointSocket } from '@deepseek-ai/dsh-remote-access-client'
import {
  FailClosedDesktopRelayLifecycle,
  type DesktopRelayLifecycle,
} from '@deepseek-ai/dsh-remote-access-client/desktop-relay-lifecycle'

const CRYPTO_GATE = 'Personal Pairing requires an independently reviewed handshake and Relay crypto provider.'

/** Validated Desktop endpoint deployment inputs. */
export interface DesktopRemoteRelayConfig {
  url: string
  attachTimeoutMs: number
  heartbeatIntervalMs: number
  reconnectDelayMs: number
  inboundMaxBytes: number
  inboundMaxMessages: number
}

/** Product composition dependencies for a Desktop Relay lifecycle. */
export interface DesktopRemoteRelayOptions {
  environment: SelectedPlatformEnvironment
  source: NodeJS.ProcessEnv | Record<string, string | undefined>
  connect?: (signal: AbortSignal, config: DesktopRemoteRelayConfig) => Promise<RelayEndpointSocket>
}

/**
 * Parse the complete Desktop WSS bundle before network acquisition.
 * @param source - Desktop process environment.
 * @returns validated WSS and bounded queue inputs.
 */
export function loadDesktopRemoteRelayConfig(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): DesktopRemoteRelayConfig {
  const url = required(source, 'DSH_REMOTE_RELAY_WSS_URL')
  if (new URL(url).protocol !== 'wss:') throw new TypeError('DSH_REMOTE_RELAY_WSS_URL must use WSS')
  const config: DesktopRemoteRelayConfig = {
    url,
    attachTimeoutMs: positiveInteger(source, 'DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS'),
    heartbeatIntervalMs: positiveInteger(source, 'DSH_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS'),
    reconnectDelayMs: positiveInteger(source, 'DSH_REMOTE_RELAY_RECONNECT_DELAY_MS'),
    inboundMaxBytes: positiveInteger(source, 'DSH_REMOTE_RELAY_INBOUND_MAX_BYTES'),
    inboundMaxMessages: positiveInteger(source, 'DSH_REMOTE_RELAY_INBOUND_MAX_MESSAGES'),
  }
  if (config.inboundMaxBytes < REMOTE_PROTOCOL_LIMITS.relayMessageBytes) {
    throw new TypeError('DSH_REMOTE_RELAY_INBOUND_MAX_BYTES must admit one maximum Relay message')
  }
  return config
}

/**
 * Select the observable production crypto gate or the explicit development endpoint.
 * @param options - Platform environment, process configuration, and optional socket adapter.
 * @returns Desktop-owned Relay lifecycle injected into Settings.
 */
export function createDesktopRemoteRelay(options: DesktopRemoteRelayOptions): DesktopRelayLifecycle {
  void options
  return new FailClosedDesktopRelayLifecycle(CRYPTO_GATE)
}

function required(source: Record<string, string | undefined>, name: string): string {
  const value = source[name]
  if (value === undefined || value.length === 0) throw new TypeError(`${name} must be configured`)
  return value
}

function positiveInteger(source: Record<string, string | undefined>, name: string): number {
  const value = Number(required(source, name))
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}
