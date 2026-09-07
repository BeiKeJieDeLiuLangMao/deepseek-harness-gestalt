/** Session Controller ownership of feature admission failure normalization. */

import { isRemoteFailure } from '@deepseek-ai/dsh-api-gateway/client'
import {
  RemoteError,
  type RemoteFailure,
  type RemoteResult,
} from '@deepseek-ai/dsh-typert-protocol'
import type {
  SessionAdmissionFailure,
  SessionAdmissionModelRoute,
  SessionAdmissionResult,
  SessionModelRoute,
} from '../contract/admission.ts'

function thrownFailure(error: unknown): RemoteFailure {
  if (isRemoteFailure(error)) return error
  const message = error instanceof Error ? error.message : String(error)
  return new RemoteError('gateway/internal', message, {})
}

function rebuiltFailure(fields: SessionAdmissionFailure): RemoteFailure {
  if (isRemoteFailure(fields)) return fields
  // SessionAdmissionFailure distributes the code/details pair. The constructor
  // cannot retain that correlation when TypeScript sees the complete union.
  return new RemoteError(fields.code, fields.message, fields.details) as RemoteFailure
}

/**
 * Run one feature admission callback and rebuild its public Remote failure.
 * @param operation - callback invocation owned by the current admission route.
 * @returns a Remote result that never rejects for callback failures.
 */
export async function runSessionAdmission<T>(
  operation: () => Promise<SessionAdmissionResult<T>>,
): Promise<RemoteResult<T>> {
  try {
    const result = await operation()
    return result.ok ? result : { ok: false, error: rebuiltFailure(result.error) }
  } catch (error) {
    return { ok: false, error: thrownFailure(error) }
  }
}

/**
 * Wrap the async methods of one feature model route with admission normalization.
 * @param route - feature route resolved synchronously for one Session.
 * @returns consumer route preserving optional methods, receiver, and signals.
 */
export function sessionAdmissionModelRoute(route: SessionAdmissionModelRoute): SessionModelRoute {
  const models = route.models?.bind(route)
  const selectModel = route.selectModel?.bind(route)
  return {
    ...(models === undefined
      ? {}
      : { models: (signal?: AbortSignal) => runSessionAdmission(() => models(signal)) }),
    ...(selectModel === undefined
      ? {}
      : {
        selectModel: (selection, signal) =>
          runSessionAdmission(() => selectModel(selection, signal)),
      }),
  }
}
