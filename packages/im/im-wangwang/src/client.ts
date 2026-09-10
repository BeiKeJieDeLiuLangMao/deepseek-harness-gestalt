/**
 * Fetch-based Wangwang OpenAPI client.
 * Does not use axios or external HTTP libraries; uses standard fetch with HMAC headers.
 *
 * @module @deepseek-ai/dsh-im-wangwang/client
 */

import { signWangwangRequest } from './auth.ts'
import type {
  ResolvedWangwangCredentials,
  WangwangRawEvent,
} from './types.ts'

export interface WangwangPullEventsRequest {
  readonly merchantId: string
  readonly sinceId?: number
  readonly limit?: number
  readonly waitSeconds?: number
  readonly requestId?: string
}

export interface WangwangPullEventsResponse {
  readonly events: readonly WangwangRawEvent[]
  readonly nextSinceId: number
  readonly hasMore: boolean
}

export interface WangwangSendMessageClientRequest {
  readonly merchantId: string
  readonly customerId: string
  readonly content: string
  readonly userId: string
  readonly requestId: string
}

export interface WangwangSendMessageClientResponse {
  readonly messageId: string
  readonly producerId?: string
  readonly producerRevision?: string
}

export class WangwangOpenApiClient {
  private readonly endpoint: string
  private readonly credentials: ResolvedWangwangCredentials
  private readonly customFetch?: typeof fetch | undefined

  constructor(options: {
    endpoint: string
    credentials: ResolvedWangwangCredentials
    fetch?: typeof fetch | undefined
  }) {
    this.endpoint = options.endpoint.replace(/\/+$/, '')
    this.credentials = options.credentials
    this.customFetch = options.fetch
  }

  private get fetchImpl(): typeof fetch {
    return this.customFetch ?? globalThis.fetch
  }

  /**
   * Pull incremental events page.
   * Path: /openapi/wangwang/events
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
      credentials: this.credentials,
      method: 'GET',
      path,
      query,
      timestamp,
      ...(request.requestId ? { requestId: request.requestId } : {}),
    })

    const url = `${this.endpoint}${path}${signed.queryString ? `?${signed.queryString}` : ''}`
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
      events.push({
        eventId: String(e.eventId ?? ''),
        merchantId: String(e.merchantId ?? ''),
        senderType: (Number(e.senderType) as 1 | 2 | 3) || 1,
        messageId: String(e.messageId ?? ''),
        customerId: String(e.customerId ?? ''),
        ...(typeof e.customerNick === 'string' ? { customerNick: e.customerNick } : {}),
        ...(typeof e.customerAvatar === 'string' ? { customerAvatar: e.customerAvatar } : {}),
        conversationId: String(e.conversationId ?? ''),
        msgType: (e.msgType as 1 | 2) ?? 1,
        textContent: typeof e.textContent === 'string' ? e.textContent : (typeof e.content === 'string' ? e.content : ''),
        ...(Array.isArray(e.attachments)
          ? {
            attachments: (e.attachments as ReadonlyArray<Record<string, unknown>>).map(att => ({
              mediaType: String(att.mediaType ?? ''),
              mediaUrl: String(att.mediaUrl ?? ''),
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
   */
  async sendMessage(request: WangwangSendMessageClientRequest): Promise<WangwangSendMessageClientResponse> {
    const path = '/openapi/wangwang/messages'
    const timestamp = Date.now()

    const signed = signWangwangRequest({
      credentials: this.credentials,
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
      // Network failure after/during request send is AMBIGUOUS
      const message = networkErr instanceof Error ? networkErr.message : String(networkErr)
      const err = new Error(`NETWORK_ERROR_DURING_SEND: ${message}`)
      Reflect.set(err, 'isAmbiguous', true)
      throw err
    }

    if (!response.ok) {
      const errText = await response.text()
      const isAmbiguous = response.status >= 500 || response.status === 408 || response.status === 429
      const err = new Error(`Wangwang sendMessage failed: HTTP ${response.status} ${errText}`)
      if (isAmbiguous) {
        Reflect.set(err, 'isAmbiguous', true)
      }
      throw err
    }

    const json = (await response.json()) as Record<string, unknown>
    if (json.code !== 0 && json.success !== true && json.status !== 'success') {
      const errDetail = typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : 'unknown error'
      const err = new Error(`Wangwang sendMessage API error: ${errDetail}`)
      throw err
    }

    const data = (json.data as Record<string, unknown> | undefined) ?? json
    return {
      messageId: String(data.messageId ?? ''),
      ...(typeof data.producerId === 'string' ? { producerId: data.producerId } : {}),
      ...(typeof data.producerRevision === 'string' ? { producerRevision: data.producerRevision } : {}),
    }
  }
}
