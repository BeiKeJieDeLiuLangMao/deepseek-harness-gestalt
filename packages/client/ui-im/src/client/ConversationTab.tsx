/**
 * Better Sidebar IM conversation tab: sender badges, delivery states,
 * manual send, simulated-member inject, and both-session navigation.
 */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ImGuiFace } from './faces.ts'
import type { ImDeliveryState, ImSenderBadge } from './model.ts'
import css from './ConversationTab.module.css'

/** Props bound for the official IM conversation tab body. */
export type ConversationTabProps =
  PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'settings.im'>
  & InjectFace<ImGuiFace>

const SENDER_TONE: Record<ImSenderBadge, 'info' | 'success' | 'neutral' | 'warning'> = {
  external: 'info',
  ai_outbound: 'success',
  human_native: 'neutral',
  human_dsh: 'neutral',
  unknown: 'warning',
}

const SENDER_KEY: Record<ImSenderBadge, 'senderExternal' | 'senderAi' | 'senderNative' | 'senderDsh' | 'senderUnknown'> = {
  external: 'senderExternal',
  ai_outbound: 'senderAi',
  human_native: 'senderNative',
  human_dsh: 'senderDsh',
  unknown: 'senderUnknown',
}

const DELIVERY_KEY: Record<ImDeliveryState, 'deliveryReceived' | 'deliverySubmitted' | 'deliverySent' | 'deliveryUnknown' | 'deliveryPending' | 'deliveryFailed'> = {
  received: 'deliveryReceived',
  submitted: 'deliverySubmitted',
  sent: 'deliverySent',
  result_unknown: 'deliveryUnknown',
  pending: 'deliveryPending',
  confirmed_failed: 'deliveryFailed',
}

const DELIVERY_TONE: Record<ImDeliveryState, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  received: 'neutral',
  submitted: 'info',
  sent: 'success',
  result_unknown: 'warning',
  pending: 'neutral',
  confirmed_failed: 'danger',
}

/**
 * Render the IM conversation tab.
 * @param props - locale copy and GUI snapshot callbacks.
 */
export function ConversationTab(props: ConversationTabProps) {
  const snapshot = props.useGui(state => state)
  const conversation = snapshot.conversation
  const [draft, setDraft] = useState('')
  if (conversation.unconfigured) {
    return (
      <div className={css.pane} data-im-conversation>
        <div className={css.empty}>
          <div>{props.t('simulationUnconfigured')}</div>
          <p>{props.t('simulationUnconfiguredHint')}</p>
        </div>
      </div>
    )
  }
  const stripClass = conversation.panel === 'live'
    ? css.live
    : conversation.panel === 'disabled'
      ? css.disabled
      : conversation.panel === 'offline' ? css.offline : css.unknown
  const stripText = conversation.panel === 'live'
    ? props.t('live')
    : conversation.panel === 'disabled'
      ? props.t('disabledStrip')
      : conversation.panel === 'offline' ? props.t('offlineStrip') : props.t('unknownStrip')
  const canSend = conversation.panel !== 'offline'
  return (
    <div className={css.pane} data-im-conversation>
      <div className={css.head}>
        <div className={css.title}>{conversation.title}</div>
        <div className={css.roles}>
          <Button
            variant={conversation.role === 'simuser' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => { props.setRole('simuser') }}
          >
            {props.t('openSimuser')}
          </Button>
          <Button
            variant={conversation.role === 'tested' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => { props.setRole('tested') }}
          >
            {props.t('openTested')}
          </Button>
          {conversation.role === 'simuser' && conversation.simulationInstanceId === undefined && (
            <Button variant="outline" size="sm" onClick={() => { props.createSimulation() }}>
              {props.t('createSimulation')}
            </Button>
          )}
        </div>
      </div>
      <div className={`${css.strip} ${stripClass ?? ''}`} data-im-strip={conversation.panel}>
        <span>{stripText}</span>
        {conversation.panel === 'live' && (
          <Button variant="ghost" size="sm" onClick={() => { props.setPanel('disabled') }}>
            {props.t('liveDisable')}
          </Button>
        )}
        {conversation.panel === 'disabled' && (
          <Button variant="ghost" size="sm" onClick={() => { props.setPanel('live') }}>
            {props.t('enableStrip')}
          </Button>
        )}
      </div>
      <div className={css.flow}>
        {conversation.messages.map(message => (
          <div key={message.id} className={css.row} data-message={message.id}>
            <div className={css.meta}>
              <span>{message.who}</span>
              <Tag tone={SENDER_TONE[message.sender]}>{props.t(SENDER_KEY[message.sender])}</Tag>
              <span data-delivery={message.delivery}>
                <Tag tone={DELIVERY_TONE[message.delivery]}>
                  {props.t(DELIVERY_KEY[message.delivery])}
                </Tag>
              </span>
            </div>
            <div className={css.text}>{message.text}</div>
          </div>
        ))}
      </div>
      <div className={css.composer}>
        <textarea
          className={css.input}
          aria-label={conversation.role === 'simuser' && conversation.simulationInstanceId !== undefined
            ? props.t('memberHint')
            : props.t('composerHint')}
          placeholder={conversation.role === 'simuser' && conversation.simulationInstanceId !== undefined
            ? props.t('memberHint')
            : props.t('composerHint')}
          disabled={!canSend}
          value={draft}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        {conversation.role === 'simuser' && conversation.simulationInstanceId !== undefined ? (
          <Button
            variant="primary"
            disabled={!canSend || draft.trim() === ''}
            onClick={() => {
              props.injectMember(draft)
              setDraft('')
            }}
          >
            {props.t('sendAsMember')}
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!canSend || draft.trim() === ''}
            onClick={() => {
              props.manualSend(draft)
              setDraft('')
            }}
          >
            {props.t('send')}
          </Button>
        )}
      </div>
    </div>
  )
}
