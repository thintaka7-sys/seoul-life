import { useState } from 'react'
import { nowIso, useGame } from '../../app/GameContext'
import { useSpeechStatus } from '../../app/hooks'
import { practiceIndex } from '../../app/practice'
import { Button } from '../../components/Button'
import { DraftBadge } from '../../components/DraftBadge'
import { Notice } from '../../components/Notice'
import { PracticeRunner } from '../../components/practice/PracticeRunner'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'
import { shuffle } from '../../learning/hangul/quiz'
import { buildQuestions, type PracticeQuestion } from '../../learning/practice/questions'
import { parseReviewKey, reviewKey } from '../../learning/review/review'
import { TeacherSays } from '../../components/TeacherCall'

/** 基礎ドリル（GAME_SPEC 4-9）。初めて正解した問題に経験値。間違えた問題は翌日の復習へ */
export function DrillPage({ drillId }: { drillId: string }) {
  const { dispatch } = useGame()
  const speech = useSpeechStatus()
  const drill = content.drills.find((d) => d.id === drillId)
  const [session, setSession] = useState<{ questions: PracticeQuestion[]; seq: number } | null>(null)
  const close = () => dispatch({ type: 'closeStudyScene' })

  if (drill === undefined) {
    return (
      <ScreenLayout eyebrow="ドリル" title="見つかりません" footer={<Button onClick={close}>戻る</Button>}>
        <Notice tone="warn">このドリルは見つかりませんでした。</Notice>
      </ScreenLayout>
    )
  }
  const count = Math.min(drill.questionCount ?? content.balance.drillQuestions, drill.items.length)

  function start() {
    if (drill === undefined) return
    const keys = shuffle(drill.items, Math.random)
      .slice(0, count)
      .map((item) => reviewKey('drill', item.id))
    const questions = buildQuestions(practiceIndex, keys, { audio: speech.state === 'available', random: Math.random })
    setSession((s) => ({ questions, seq: (s?.seq ?? 0) + 1 }))
  }

  const title = (
    <>
      {drill.titleJa}
      {!drill.reviewed && <DraftBadge />}
    </>
  )

  return (
    <ScreenLayout eyebrow="基礎ドリル" title={title} footer={<Button onClick={close}>戻る</Button>}>
      {session === null ? (
        <section className="panel">
          {drill.introJa !== undefined && <TeacherSays paragraphs={[drill.introJa]} />}
          <p className="muted small">
            1回 {count} 問。初めて正解した問題には経験値が付きます。間違えた問題は、明日の復習にもう一度出ます。
            {drill.items.some((i) => i.digits !== undefined) && '数字の問題は、選択肢を出さずに入力で答えます。'}
          </p>
          <Button variant="primary" onClick={start}>
            はじめる
          </Button>
        </section>
      ) : (
        <PracticeRunner
          key={session.seq}
          questions={session.questions}
          retry
          onAnswer={(key, correct) => {
            const parsed = parseReviewKey(key)
            if (parsed?.kind === 'drill') dispatch({ type: 'drillAnswered', itemId: parsed.id, correct, now: nowIso() })
          }}
          onFinish={() => dispatch({ type: 'activityCompleted', activity: 'drill', now: nowIso() })}
          finish={() => (
            <>
              <Button variant="primary" onClick={start}>
                もう一度
              </Button>
              <Button onClick={close}>一覧に戻る</Button>
            </>
          )}
        />
      )}
    </ScreenLayout>
  )
}
