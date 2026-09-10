/**
 * Sidebar presentation of assembled IM records: sender badges, delivery
 * states, and the named live-lane list. Does not call real adapters.
 */
import { describe, expect, it } from 'vitest'
import {
  conversationMessagesFromRecords,
  deliveryStateOf,
  IM_LIVE_LANE_BEHAVIORS,
} from '../src/client/presentation.ts'

describe('IM GUI assembled presentation', () => {
  it('maps domain sender and delivery facts, keeping result_unknown off the success arm', () => {
    const rows = conversationMessagesFromRecords([
      {
        id: 'm1',
        text: '@bot hello',
        who: 'Alice',
        sender: 'external',
        inboundStage: 'submitted',
      },
      {
        id: 'm2',
        text: 'owner',
        who: '陈小宇',
        sender: 'human_dsh',
        inboundStage: 'received',
      },
      {
        id: 'm3',
        text: 'reply',
        who: '数字员工',
        sender: 'ai_outbound',
        outboundStatus: 'sent',
      },
      {
        id: 'm4',
        text: 'native',
        who: '陈小宇',
        sender: 'human_native',
        inboundStage: 'received',
      },
      {
        id: 'm5',
        text: 'unclear',
        who: '未知',
        sender: 'unknown',
        outboundStatus: 'result_unknown',
      },
    ])
    expect(rows.map(row => row.sender)).toEqual([
      'external', 'human_dsh', 'ai_outbound', 'human_native', 'unknown',
    ])
    expect(rows.map(row => row.delivery)).toEqual([
      'submitted', 'received', 'sent', 'received', 'result_unknown',
    ])
    expect(deliveryStateOf({
      id: 'x', text: '', who: '', sender: 'unknown', outboundStatus: 'result_unknown',
    })).not.toBe('sent')
    expect(IM_LIVE_LANE_BEHAVIORS).toEqual([
      'real DingTalk DWS login and account directory read',
      'real Wangwang endpoint/AK/SK account read',
      'real outbound send to a live conversation',
      'real model calls for agent replies',
      'native Desktop GUI computer-use acceptance of the Sidebar',
    ])
  })
})
