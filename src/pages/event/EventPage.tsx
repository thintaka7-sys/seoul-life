import { useCallback } from 'react'
import { eventBackdrop } from '../../app/backdrop'
import { useGame, nowIso } from '../../app/GameContext'
import { Button } from '../../components/Button'
import { content, findColumn, findConversation, findGameEvent, findLocation, findStory } from '../../data'
import { backgroundAt, stepProgress } from '../../game/events/events'
import { DictionaryList } from '../DictionaryPage'
import { ColumnStep } from './ColumnStep'
import { ConversationStep } from './ConversationStep'
import { ChapterEndStep } from './ChapterEndStep'
import { DayEndStep } from './DayEndStep'
import { HangulIntroStep } from './HangulIntroStep'
import { StoryStep } from './StoryStep'
import { LearnStep } from './LearnStep'
import { ListeningStep } from './ListeningStep'
import { OrderStep } from './OrderStep'
import { ReadingStep } from './ReadingStep'

/** イベントの段階を1つずつ表示する画面 */
export function EventPage() {
  const { state, dispatch } = useGame()
  const run = state.run
  const event = run === null ? undefined : findGameEvent(run.eventId)
  const step = run === null ? undefined : event?.steps[run.step]
  const storyDone = useCallback(() => dispatch({ type: 'storyDone', now: nowIso() }), [dispatch])
  const stepDone = useCallback(() => dispatch({ type: 'stepDone', now: nowIso() }), [dispatch])

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
    case 'story': {
      const story = findStory(step.id)
      body = story === undefined ? <p>おはなしが見つかりませんでした。</p> : <StoryStep key={stepKey} story={story} background={backgroundAt(event, run.step)} onDone={storyDone} />
      break
    }
    case 'hangulIntro':
      body = <HangulIntroStep />
      break
    case 'chapterEnd':
      body = <ChapterEndStep key={stepKey} chapter={event.chapter} textJa={step.textJa} />
      break
    case 'reading': {
      const reading = content.readings.find((r) => r.id === step.id)
      body = reading === undefined ? <p>読み物が見つかりませんでした。</p> : <ReadingStep key={stepKey} reading={reading} onDone={stepDone} />
      break
    }
    case 'order': {
      const order = content.orders.find((o) => o.id === step.id)
      body = order === undefined ? <p>注文の教材が見つかりませんでした。</p> : <OrderStep key={stepKey} order={order} onDone={stepDone} />
      break
    }
    case 'listening':
      body = <ListeningStep key={stepKey} eventId={event.id} chapter={event.chapter} onDone={stepDone} />
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
          {step.type === 'conversation' || step.type === 'story' || step.type === 'reading' || step.type === 'order' || step.type === 'listening' ? body : <div className="panel">{body}</div>}
        </div>
      </div>
    </main>
  )
}
