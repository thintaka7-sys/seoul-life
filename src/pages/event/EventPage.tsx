import { useGame, nowIso } from '../../app/GameContext'
import { Button } from '../../components/Button'
import { content, findColumn, findConversation, findGameEvent, findLocation } from '../../data'
import { DictionaryList } from '../DictionaryPage'
import { ColumnStep } from './ColumnStep'
import { ConversationStep } from './ConversationStep'
import { LearnStep } from './LearnStep'

function DayEnd({ textJa }: { textJa: string }) {
  const { state, dispatch } = useGame()
  const words = Object.keys(state.save?.learning.words ?? {}).length
  // イベントを終えたときの経験値は「閉じる」の後で付くため、初めて終えるときは先に足して見せる
  const run = state.run
  const firstFinish = run !== null && !run.replay && state.save?.progress.completedEvents.includes(run.eventId) === false
  const xp = (state.save?.stats.xp ?? 0) + (firstFinish ? content.balance.xp.eventComplete : 0)
  return (
    <div className="day-end">
      <p className="day-end__title">{textJa}</p>
      <dl className="stats">
        <div>
          <dt>覚えた単語</dt>
          <dd>
            {words} / {content.vocabulary.length} 語
          </dd>
        </div>
        <div>
          <dt>経験値</dt>
          <dd>{xp}</dd>
        </div>
      </dl>
      <Button variant="primary" onClick={() => dispatch({ type: 'stepDone', now: nowIso() })}>
        閉じる
      </Button>
    </div>
  )
}

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
          <ConversationStep key={stepKey} conversation={conversation} />
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
      body = <DayEnd textJa={step.textJa} />
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
      <progress className="event-progress" max={event.steps.length} value={run.step} aria-label="イベントの進み具合" />
      <div className="screen__body">{body}</div>
    </main>
  )
}
