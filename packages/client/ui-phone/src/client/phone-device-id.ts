import type { DeviceId } from '@deepseek-ai/dsh-phone-runtime'

/** Brand one non-empty device identity after browser JSON validation.
 * @param value - Validated non-empty Android serial or iOS UDID.
 * @returns the branded device identity.
 */
export function phoneDeviceIdOf(value: string): DeviceId {
  if (value.length === 0) throw new TypeError('phone device id must not be empty')
  return value as DeviceId
}
