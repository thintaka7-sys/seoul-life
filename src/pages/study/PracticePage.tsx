import { useState } from 'react'
import { nowIso, useGame } from '../../app/GameContext'
import { useSpeechStatus } from '../../app/hooks'
import { chapterOfKey, learnedKeys, practiceIndex, type PracticeCategory } from '../../app/practice'
import { Button } from '../../components/Button'
import { PracticeRunner } from '../../components/practice/PracticeRunner'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'
import { shuffle } from '../../learning/hangul/quiz'
import { buildQuestions, type PracticeQuestion } from '../../learning/practice/questions'

const CATEGORIES: { category: PracticeCategory; label: string; description: string }[] = [
  { category: 'word', label: '単語', description: '意味を選ぶ・聞いて選ぶ・文字を並べる・書く' },
  { category: 'grammar', label: '文法', description: '穴埋め・語を並べる・書く' },
  { category: 'turn', label: '会話', description: '場面に合う返事を選ぶ・書く' },
]

/** 練習（計画 Q13）。学んだものから自由に出題する。経験値はなし。間違えた問題は翌日の復習に戻す */
export function PracticePage() {
  const { state, dispatch } = useGame()
  const speech = useSpeechStatus()
  const save = state.save
  const [session, setSession] = useState<{ category: PracticeCategory; questions: PracticeQuestion[]; seq: number } | null>(null)
  const close = () => dispatch({ type: 'closeStudyScene' })

  function start(category: PracticeCategory) {
    if (save === null) return
    const keys = shuffle(learnedKeys(save, category), Math.random).slice(0, content.balance.practiceQuestions)
    const questions = buildQuestions(practiceIndex, keys, { audio: speech.state === 'available', random: Math.random, chapterOf: chapterOfKey(save) })
    setSession((s) => ({ category, questions, seq: (s?.seq ?? 0) + 1 }))
  }

  const body =
    session === null || save === null ? (
      <section className="panel actions">
        <p>学んだ単語・文法・会話から、自由に練習できます。経験値は付きませんが、間違えた問題は翌日の復習にもう一度出ます。</p>
        {CATEGORIES.map(({ category, label, description }) => {
          const count = save === null ? 0 : learnedKeys(save, category).length
          return (
            <div key={category} className="actions">
              <Button variant="primary" onClick={() => start(category)} disabled={count === 0}>
                {label}（{count}）
              </Button>
              <p className="muted small">{count === 0 ? 'まだ学んだものがありません。物語を進めると練習できるようになります。' : description}</p>
            </div>
          )
        })}
      </section>
    ) : (
      <PracticeRunner
        key={session.seq}
        questions={session.questions}
        retry
        onAnswer={(key, correct) => dispatch({ type: 'reviewAnswered', key, correct, source: 'practice', now: nowIso() })}
        finish={() => (
          <>
            <Button variant="primary" onClick={() => start(session.category)}>
              もう一度
            </Button>
            <Button onClick={() => setSession(null)}>ほかの練習を選ぶ</Button>
          </>
        )}
      />
    )

  return (
    <ScreenLayout eyebrow="勉強する" title="練習" footer={<Button onClick={close}>戻る</Button>}>
      {body}
    </ScreenLayout>
  )
}
