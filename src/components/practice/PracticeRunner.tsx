import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  /** すべて終えたときに1回だけ呼ぶ（記録・スタンプのため） */
  onFinish?: (round: PracticeRound) => void
  /** 結果の見出しの下に出すもの（章末テストの合否など） */
  summary?: (round: PracticeRound) => ReactNode
}

/** 1回分の問題を順に出し、終わったら結果を見せる */
export function PracticeRunner({ questions, retry, onAnswer, finish, onFinish, summary }: PracticeRunnerProps) {
  const [round, setRound] = useState(() => startRound(questions, retry))
  const q = currentQuestion(round)
  const finished = q === undefined
  // 最新の onFinish を使いつつ、終えたときに1回だけ呼ぶ
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  useEffect(() => {
    if (finished && round.firstCount > 0) onFinishRef.current?.(round)
    // round は終えた時点のものだけを使う（終えた後は変わらない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  if (q === undefined) {
    const wrong = round.results.filter((r) => !r.correct).length
    return (
      <section className="panel result" aria-live="polite">
        <p className="correct">おつかれさまでした</p>
        <p>
          {round.firstCount}問中 {correctCount(round)}問正解
        </p>
        {summary?.(round)}
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
