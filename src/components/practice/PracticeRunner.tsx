import { useState, type ReactNode } from 'react'
import type { PracticeQuestion } from '../../learning/practice/questions'
import { answerRound, correctCount, currentQuestion, isRetry, nextQuestion, startRound, type PracticeRound } from '../../learning/practice/round'
import { PracticeQuestionView } from './PracticeQuestionView'

interface PracticeRunnerProps {
  questions: readonly PracticeQuestion[]
  /** 間違えた問題を最後にもう一度出すか */
  retry: boolean
  /** 最初の出題に答えたとき（もう一度出した問題では呼ばない） */
  onAnswer: (key: string, correct: boolean) => void
  /** すべて終えたときに出すもの（結果の下） */
  finish: (round: PracticeRound) => ReactNode
}

/** 1回分の問題を順に出し、終わったら結果を見せる */
export function PracticeRunner({ questions, retry, onAnswer, finish }: PracticeRunnerProps) {
  const [round, setRound] = useState(() => startRound(questions, retry))
  const q = currentQuestion(round)

  if (q === undefined) {
    const wrong = round.results.filter((r) => !r.correct).length
    return (
      <section className="panel result" aria-live="polite">
        <p className="correct">おつかれさまでした</p>
        <p>
          {round.firstCount}問中 {correctCount(round)}問正解
        </p>
        {wrong > 0 && <p className="muted small">間違えた問題は、明日の復習にもう一度出ます。</p>}
        {finish(round)}
      </section>
    )
  }

  const retrying = isRetry(round)
  const last = round.index === round.questions.length - 1
  const willRetry = retry && round.index === round.firstCount - 1 && round.results.some((r) => !r.correct)
  return (
    <PracticeQuestionView
      key={round.index}
      q={q}
      position={retrying ? `もう一度 ${round.index - round.firstCount + 1} / ${round.questions.length - round.firstCount}` : `${round.index + 1} / ${round.firstCount}`}
      retry={retrying}
      onAnswered={(correct) => {
        if (!retrying) onAnswer(q.key, correct)
        setRound((r) => answerRound(r, correct))
      }}
      onNext={() => setRound((r) => nextQuestion(r, Math.random))}
      nextLabel={last && !willRetry ? '結果を見る' : '次へ'}
    />
  )
}
