import { useMemo, useState } from 'react'
import { nowIso, useGame } from '../../app/GameContext'
import { useSpeechStatus } from '../../app/hooks'
import { Button } from '../../components/Button'
import { Notice } from '../../components/Notice'
import { content } from '../../data'
import { eventListeningQuestions } from '../../learning/listening/questions'
import { ListeningQuestionView } from '../study/ListeningPage'

/**
 * イベントの listening の段階：そのイベントのリスニングの文（afterEvent がこのイベント）を、その場で聞いて答える。
 * 読み上げが使えない端末では、案内を出して飛ばせるようにする
 */
export function ListeningStep({ eventId, chapter, onDone }: { eventId: string; chapter: number; onDone: () => void }) {
  const { dispatch } = useGame()
  const speech = useSpeechStatus()
  const questions = useMemo(() => eventListeningQuestions(content.listening, eventId, chapter, Math.random), [eventId, chapter])
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)

  if (speech.state !== 'available' || questions.length === 0) {
    return (
      <section className="panel">
        <Notice tone="warn">{speech.state === 'available' ? 'この段階の問題がありません。' : '読み上げが使えないため、聞き取りの問題は飛ばします。'}</Notice>
        <Button variant="primary" onClick={onDone}>
          次へ
        </Button>
      </section>
    )
  }
  const q = questions[index]
  if (q === undefined) {
    return (
      <section className="panel result" aria-live="polite">
        <p className="correct">聞き取りの練習、おつかれさまでした</p>
        <p>
          {questions.length}問中 {correct}問正解
        </p>
        <Button variant="primary" onClick={onDone}>
          次へ
        </Button>
      </section>
    )
  }
  return (
    <>
      <p className="message">聞こえた文を選んでください。</p>
      <ListeningQuestionView
        key={index}
        q={q}
        index={index}
        total={questions.length}
        onAnswered={(right) => {
          if (!right) return
          setCorrect((c) => c + 1)
          dispatch({ type: 'listeningCorrect', key: q.key, now: nowIso() })
        }}
        onNext={() => setIndex((i) => i + 1)}
      />
    </>
  )
}
