import { useGame } from '../../app/GameContext'
import { Button } from '../../components/Button'
import { ScreenLayout } from '../../components/ScreenLayout'
import { conversationName, conversationPlace } from '../../app/conversationNames'
import { content } from '../../data'
import { conversationEntries } from '../../game/conversations/replayList'

/** 会話をもう一度：終えたイベントの会話の一覧（BUG-007） */
export function ConversationListPage() {
  const { state, dispatch } = useGame()
  const save = state.save
  const entries = save === null ? [] : conversationEntries(content.events, content.conversations, save.progress.completedEvents, save.learning.conversations).filter((e) => e.playable)
  const chapters = [...new Set(entries.map((e) => e.event.chapter))].sort((a, b) => a - b)

  return (
    <ScreenLayout eyebrow="勉強する" title="会話をもう一度" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      <p className="panel-text">
        物語で終えた会話を、もう一度遊べます。答えた問題は記録して、復習と章末テストの条件に数えます。経験値は、初めて正解した問題だけに付きます。
      </p>
      {entries.length === 0 ? (
        <p className="panel-text">まだ終えた会話がありません。物語を進めると、ここから遊べるようになります。</p>
      ) : (
        chapters.map((chapter) => (
          <section key={chapter} className="panel" aria-labelledby={`conv-ch${chapter}`}>
            <h2 id={`conv-ch${chapter}`} className="step-heading">
              第{chapter}章
            </h2>
            <ol className="lesson-list">
              {entries
                .filter((e) => e.event.chapter === chapter)
                .map((e) => (
                  <li key={e.conversation.id}>
                    <button type="button" className="lesson-item lesson-item--plain" onClick={() => dispatch({ type: 'openConversationReplay', conversationId: e.conversation.id })}>
                      <span className="lesson-item__title">
                        {conversationName(e)}
                        <span className="muted small">{conversationPlace(e)}</span>
                      </span>
                      <span className={`lesson-item__status${e.answered === e.total ? ' lesson-item__status--passed' : ''}`}>
                        問題 {e.answered} / {e.total}
                      </span>
                    </button>
                  </li>
                ))}
            </ol>
          </section>
        ))
      )}
    </ScreenLayout>
  )
}
