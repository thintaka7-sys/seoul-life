import { nowIso, useGame } from '../../app/GameContext'
import { Button } from '../../components/Button'
import { backgroundImage, findConversation, findLocation } from '../../data'
import { ConversationStep } from '../event/ConversationStep'

/** 会話をもう一度：1つの会話を遊ぶ。答えた問題の往復は記録・復習に入れる（BUG-007） */
export function ConversationReplayPage({ conversationId }: { conversationId: string }) {
  const { dispatch } = useGame()
  const conversation = findConversation(conversationId)
  const close = () => dispatch({ type: 'closeStudyScene' })

  if (conversation === undefined) {
    return (
      <main className="screen">
        <p>会話が見つかりませんでした。</p>
        <Button onClick={close}>戻る</Button>
      </main>
    )
  }

  return (
    <main className="screen">
      <header className="screen__header event-header">
        <div>
          <p className="screen__eyebrow">{findLocation(conversation.location)?.nameJa ?? conversation.location}・遊び直し</p>
          <h1 className="screen__title">会話をもう一度</h1>
        </div>
        <div className="event-header__actions">
          <button type="button" className="link-button" onClick={() => dispatch({ type: 'openSettings' })}>
            設定
          </button>
          <button type="button" className="link-button" onClick={close}>
            やめる
          </button>
        </div>
      </header>
      <div className="screen__body">
        <ConversationStep
          key={conversation.id}
          conversation={conversation}
          replay
          hasBackground={backgroundImage(conversation.location) !== undefined}
          onTurnAnswered={(turn, method) => dispatch({ type: 'replayTurnAnswered', turn, method, now: nowIso() })}
          onDone={close}
        />
      </div>
    </main>
  )
}
