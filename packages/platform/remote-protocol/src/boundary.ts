import { RemoteProtocolError } from './errors.ts'
import { REMOTE_PROTOCOL_LIMITS } from './limits.ts'

/**
 * Decode bounded protocol JSON without recursively traversing attacker-controlled values.
 * @param encoded - untrusted UTF-8 JSON bytes.
 * @param byteLimit - complete message ceiling applied before decoding.
 * @param name - protocol subject used in stable diagnostics.
 * @returns parsed JSON after all shared value limits pass.
 */
export function decodeProtocolJson(encoded: Uint8Array, byteLimit: number, name: string): unknown {
  if (encoded.byteLength > byteLimit) limit(`${name} exceeds its ${String(byteLimit)}-byte ceiling`)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded)) as unknown
  } catch {
    throw new RemoteProtocolError('REMOTE_PROTOCOL_INVALID_MESSAGE', `${name} is not valid UTF-8 JSON`)
  }
  validateEncodedValue(value, name)
  return value
}

/**
 * Encode protocol JSON after checking the complete emitted value and byte ceiling.
 * @param value - typed protocol value at the outbound wire boundary.
 * @param byteLimit - complete message ceiling applied after encoding.
 * @param name - protocol subject used in stable diagnostics.
 * @returns bounded UTF-8 JSON bytes.
 */
export function encodeProtocolJson(value: unknown, byteLimit: number, name: string): Uint8Array {
  validateEncodedValue(value, name)
  const encoded = new TextEncoder().encode(JSON.stringify(value))
  if (encoded.byteLength > byteLimit) limit(`${name} exceeds its ${String(byteLimit)}-byte ceiling`)
  return encoded
}

function validateEncodedValue(root: unknown, name: string): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  let count = 0
  for (const current of pending) {
    count += 1
    if (count > REMOTE_PROTOCOL_LIMITS.totalEncodedValues) {
      limit(`${name} exceeds its encoded-value count ceiling`)
    }
    const { value, depth } = current
    if (typeof value === 'string') {
      if (new TextEncoder().encode(value).byteLength > REMOTE_PROTOCOL_LIMITS.stringBytes) {
        limit(`${name} contains an oversized encoded string`)
      }
      continue
    }
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) invalid(`${name} numbers must be safe integers`)
      continue
    }
    if (value === null || typeof value === 'boolean') continue
    if (typeof value !== 'object') invalid(`${name} contains a non-JSON value`)
    if (depth >= REMOTE_PROTOCOL_LIMITS.parserDepth) limit(`${name} exceeds its parser-depth ceiling`)
    const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)
    if (children.length > REMOTE_PROTOCOL_LIMITS.containerValues) {
      limit(`${name} contains an oversized object or array`)
    }
    for (const child of children) pending.push({ value: child, depth: depth + 1 })
  }
}

function invalid(message: string): never {
  throw new RemoteProtocolError('REMOTE_PROTOCOL_INVALID_MESSAGE', message)
}

function limit(message: string): never {
  throw new RemoteProtocolError('REMOTE_PROTOCOL_LIMIT_EXCEEDED', message)
}
