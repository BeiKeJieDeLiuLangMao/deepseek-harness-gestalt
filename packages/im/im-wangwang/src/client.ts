/**
 * Fetch-based Wangwang OpenAPI client.
 * Does not use axios or external HTTP libraries; uses standard fetch with HMAC headers.
 * Credentials are supplied per request or dynamically resolved; never stored as permanent state.
 *
 * @module @deepseek-ai/dsh-im-wangwang/client
 */

import { signWangwangRequest } from './auth.ts'
import { WangwangAmbiguousError } from './errors.ts'
import type {
  ResolvedWangwangCredentials,
  WangwangRawEvent,
} from './types.ts'

/** Events-pull request; credentials travel per call and are never stored. */
export interface WangwangPullEventsRequest {
  readonly merchantId: string
  readonly credentials: ResolvedWangwangCredentials
  readonly sinceId?: number
  readonly limit?: number | undefined
  readonly waitSeconds?: number
  readonly requestId?: string
}

/** One pulled events page plus the next channel cursor position. */
export interface WangwangPullEventsResponse {
  readonly events: readonly WangwangRawEvent[]
  readonly nextSinceId: number
  readonly hasMore: boolean
}

/** Send-message request; credentials travel per call and are never stored. */
export interface WangwangSendMessageClientRequest {
  readonly merchantId: string
  readonly credentials: ResolvedWangwangCredentials
  readonly customerId: string
  readonly content: string
  readonly userId: string
  readonly requestId: string
}

/** Platform receipt of an accepted send. */
export interface WangwangSendMessageClientResponse {
  readonly messageId: string
  readonly producerId?: string
  readonly producerRevision?: string
}

/**
 * Coerce one wire field to a display string; non-string/non-number values become ''.
 * @param value - Raw wire field value.
 * @returns The string form, or '' for objects/null/absent values.
 */
function wireString(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

/**
 * Minimal fetch-based Wangwang OpenAPI client. Holds only the endpoint and an
 * optional fetch implementation; every call takes its credentials explicitly.
 */
export class WangwangOpenApiClient {
  private readonly endpoint: string
  private readonly customFetch: typeof fetch | undefined

  constructor(options: {
    endpoint: string
    fetch?: typeof fetch
  }) {
    this.endpoint = options.endpoint.replace(/\/+$/, '')
    this.customFetch = options.fetch
  }

  private get fetchImpl(): typeof fetch {
    return this.customFetch ?? globalThis.fetch
  }

  /**
   * Pull incremental events page.
   * Path: /openapi/wangwang/events
   * @param request - Merchant, per-call credentials, cursor, and page options.
   * @returns The events page and the next cursor position.
   */
  async pullEvents(request: WangwangPullEventsRequest): Promise<WangwangPullEventsResponse> {
    const path = '/openapi/wangwang/events'
    const timestamp = Date.now()
    const query: Record<string, string | number> = {
      merchantId: request.merchantId,
      sinceId: request.sinceId ?? 0,
      limit: request.limit ?? 50,
      waitSeconds: request.waitSeconds ?? 0,
    }

    const signed = signWangwangRequest({
      credentials: request.credentials,
      method: 'GET',
      path,
      query,
      timestamp,
      ...(request.requestId ? { requestId: request.requestId } : {}),
    })

    // pullEvents always carries merchantId/sinceId/limit/waitSeconds, so the
    // canonical query string is never empty here.
    const url = `${this.endpoint}${path}?${signed.queryString}`
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...signed.headers,
      },
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Wangwang pullEvents failed: HTTP ${response.status} ${errText}`)
    }

    const body = (await response.json()) as Record<string, unknown>
    if (body.code !== 0 && body.success !== true && body.status !== 'success') {
      const errDetail = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : 'unknown error'
      throw new Error(`Wangwang pullEvents API error: ${errDetail}`)
    }

    const data = (body.data as Record<string, unknown> | undefined) ?? body
    const rawEvents = (Array.isArray(data.events) ? data.events : []) as ReadonlyArray<Record<string, unknown>>
    const events: WangwangRawEvent[] = []
    for (const e of rawEvents) {
      // NaN senderType normalizes to 1 (external); out-of-union numbers pass
      // through so identity resolution can mark them `unknown`.
      const parsedSenderType = Number(e.senderType)
      events.push({
        eventId: wireString(e.eventId),
        merchantId: wireString(e.merchantId),
        senderType: (Number.isNaN(parsedSenderType) ? 1 : parsedSenderType) as 1 | 2 | 3,
        messageId: wireString(e.messageId),
        customerId: wireString(e.customerId),
        ...(typeof e.customerNick === 'string' ? { customerNick: e.customerNick } : {}),
        ...(typeof e.customerAvatar === 'string' ? { customerAvatar: e.customerAvatar } : {}),
        conversationId: wireString(e.conversationId),
        msgType: e.msgType === 2 ? 2 : 1,
        textContent: typeof e.textContent === 'string' ? e.textContent : (typeof e.content === 'string' ? e.content : ''),
        ...(Array.isArray(e.attachments)
          ? {
            attachments: (e.attachments as ReadonlyArray<Record<string, unknown>>).map(att => ({
              mediaType: wireString(att.mediaType),
              mediaUrl: wireString(att.mediaUrl),
              ...(typeof att.label === 'string' ? { label: att.label } : {}),
            })),
          }
          : {}),
        msgTime: Number(e.msgTime ?? Date.now()),
        ...(typeof e.producerId === 'string' ? { producerId: e.producerId } : {}),
        raw: e,
      })
    }

    return {
      events,
      nextSinceId: Number(data.nextSinceId ?? request.sinceId ?? 0),
      hasMore: Boolean(data.hasMore),
    }
  }

  /**
   * Send text message to a customer.
   * Path: /openapi/wangwang/messages
   * @param request - Merchant, per-call credentials, target customer, and content.
   * @returns The platform receipt of the accepted send.
   */
  async sendMessage(request: WangwangSendMessageClientRequest): Promise<WangwangSendMessageClientResponse> {
    const path = '/openapi/wangwang/messages'
    const timestamp = Date.now()

    const signed = signWangwangRequest({
      credentials: request.credentials,
      method: 'POST',
      path,
      timestamp,
      requestId: request.requestId,
    })

    const bodyObj = {
      merchantId: request.merchantId,
      customerId: request.customerId,
      content: request.content,
      userId: request.userId,
    }

    const url = `${this.endpoint}${path}`
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Accept: 'application/json',
          ...signed.headers,
        },
        body: JSON.stringify(bodyObj),
      })
    } catch (networkErr) {
      // Network failure during transmission is AMBIGUOUS
      const message = networkErr instanceof Error ? networkErr.message : String(networkErr)
      throw new WangwangAmbiguousError(`NETWORK_ERROR_DURING_SEND: ${message}`, {
        cause: networkErr,
      })
    }

    if (!response.ok) {
      const errText = await response.text()
      const isAmbiguous = response.status >= 500 || response.status === 408 || response.status === 429
      if (isAmbiguous) {
        throw new WangwangAmbiguousError(`Wangwang sendMessage failed: HTTP ${response.status} ${errText}`, {
          httpStatus: response.status,
          rawDetails: errText,
        })
      }
      throw new Error(`Wangwang sendMessage failed: HTTP ${response.status} ${errText}`)
    }

    const json = (await response.json()) as Record<string, unknown>
    if (json.code !== 0 && json.success !== true && json.status !== 'success') {
      const errDetail = typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : 'unknown error'
      const err = new Error(`Wangwang sendMessage API error: ${errDetail}`)
      throw err
    }

    const data = (json.data as Record<string, unknown> | undefined) ?? json
    return {
      messageId: wireString(data.messageId),
      ...(typeof data.producerId === 'string' ? { producerId: data.producerId } : {}),
      ...(typeof data.producerRevision === 'string' ? { producerRevision: data.producerRevision } : {}),
    }
  }
}
