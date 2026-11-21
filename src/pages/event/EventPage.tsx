import { eventBackdrop } from '../../app/backdrop'
import { useGame, nowIso } from '../../app/GameContext'
import { Button } from '../../components/Button'
import { findColumn, findConversation, findGameEvent, findLocation } from '../../data'
import { stepProgress } from '../../game/events/events'
import { DictionaryList } from '../DictionaryPage'
import { ColumnStep } from './ColumnStep'
import { ConversationStep } from './ConversationStep'
import { DayEndStep } from './DayEndStep'
import { LearnStep } from './LearnStep'

/** イベントの段階を1つずつ表示する画面 */
export function EventPage() {
  const { state, dispatch } = useGame()
  const run = state.run
  const event = run === null ? undefined : findGameEvent(run.eventId)
  const step = run === null ? undefined : event?.steps[run.step]

  if (run === null || event === undefined || step === undefined) {
    return (
      <main className="screen">
        <p>イベントが見つかりませんでした。</p>
        <Button onClick={() => dispatch({ type: 'leaveEvent' })}>戻る</Button>
      </main>
    )
  }

  const location = findLocation(event.location)
  const progress = stepProgress(event, run.step)
  const stepKey = `${event.id}-${run.step}`

  let body
  switch (step.type) {
    case 'message':
      body = (
        <>
          <p className="message">{step.textJa}</p>
          <Button variant="primary" onClick={() => dispatch({ type: 'stepDone', now: nowIso() })}>
            次へ
          </Button>
        </>
      )
      break
    case 'learn':
      body = <LearnStep key={stepKey} vocabulary={step.vocabulary} grammar={step.grammar} chapter={event.chapter} />
      break
    case 'conversation': {
      const conversation = findConversation(step.id)
      body =
        conversation === undefined ? (
          <p>会話データが見つかりませんでした。</p>
        ) : (
          <ConversationStep
            key={stepKey}
            conversation={conversation}
            replay={run.replay}
            hasBackground={eventBackdrop(conversation.location, run) !== undefined}
            onTurnAnswered={(turn, method) => dispatch({ type: 'conversationAnswered', turn, method, now: nowIso() })}
            onDone={() => dispatch({ type: 'conversationDone', now: nowIso() })}
          />
        )
      break
    }
    case 'column': {
      const column = findColumn(step.id)
      body = column === undefined ? <p>コラムが見つかりませんでした。</p> : <ColumnStep key={stepKey} column={column} />
      break
    }
    case 'dictionary':
      body = (
        <>
          <p className="message">{step.textJa}</p>
          <DictionaryList />
          <Button variant="primary" onClick={() => dispatch({ type: 'stepDone', now: nowIso() })}>
            閉じる
          </Button>
        </>
      )
      break
    case 'dayEnd':
      body = <DayEndStep key={stepKey} textJa={step.textJa} eventId={event.id} />
      break
    case 'background':
      // 背景の切り替えは進行の処理で飛ばすので、ここには来ない（来た場合は何も出さない）
      body = null
      break
  }

  return (
    <main className="screen">
      <header className="screen__header event-header">
        <div>
          <p className="screen__eyebrow">
            {location?.nameJa ?? event.location}
            {run.replay && '・遊び直し'}
          </p>
          <h1 className="screen__title">{event.objectiveJa}</h1>
        </div>
        <div className="event-header__actions">
          <button type="button" className="link-button" onClick={() => dispatch({ type: 'openSettings' })}>
            設定
          </button>
          <button type="button" className="link-button" onClick={() => dispatch({ type: 'leaveEvent' })}>
            やめる
          </button>
        </div>
      </header>
      <progress className="event-progress" max={progress.total} value={progress.done} aria-label="イベントの進み具合" />
      <div className="screen__body">
        <div key={stepKey} className="step-enter">
          {step.type === 'conversation' ? body : <div className="panel">{body}</div>}
        </div>
      </div>
    </main>
  )
}
