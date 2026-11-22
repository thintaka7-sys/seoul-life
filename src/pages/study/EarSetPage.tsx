import { useState } from 'react'
import { nowIso, useGame } from '../../app/GameContext'
import { useSpeak, useSpeakSlow, useSpeechStatus } from '../../app/hooks'
import { Button } from '../../components/Button'
import { DraftBadge } from '../../components/DraftBadge'
import { KoreanText } from '../../components/KoreanText'
import { Notice } from '../../components/Notice'
import { SlowLabel, SlowRepeatNotice } from '../../components/practice/AnswerFeedback'
import { PracticeRunner } from '../../components/practice/PracticeRunner'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'
import type { EarSet } from '../../data/types'
import { earRound } from '../../learning/ear/round'
import type { PracticeQuestion } from '../../learning/practice/questions'
import { TeacherSays } from '../../components/TeacherCall'

/**
 * 組の音を試しに聞く（実機で聞き分けにくい組を見つけるため。計画 Q7）。
 * 1つずつ、ふつうの速さとゆっくりで聞ける
 */
function EarPreview({ set }: { set: EarSet }) {
  const speak = useSpeak()
  const speakSlow = useSpeakSlow()
  const available = useSpeechStatus().state === 'available'
  return (
    <section className="panel ear-preview" aria-labelledby="ear-preview-heading">
      <h2 id="ear-preview-heading" className="step-heading">
        試しに聞く
      </h2>
      <p className="muted small">{set.focusJa}</p>
      <ul className="ear-preview__list">
        {set.items.map((item) => (
          <li key={item.korean} className="ear-preview__item">
            <span className="ear-preview__word">
              <KoreanText korean={item.korean} reading={item.pronunciation} display="show" />
              <span className="muted small">{item.japanese}</span>
            </span>
            <span className="listen-buttons">
              <Button sound={null} disabled={!available} onClick={() => speak(item.korean, 'normal')} aria-label={`${item.korean} をふつうの速さで聞く`}>
                ▶ ふつう
              </Button>
              <Button sound={null} disabled={!available} onClick={() => speakSlow(item.korean)} aria-label={`${item.korean} をゆっくり聞く`}>
                <SlowLabel />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <SlowRepeatNotice />
      <TeacherSays paragraphs={[set.tipJa]} />
    </section>
  )
}

/** 聞き分け練習（GAME_SPEC 4-10）：1つの組（setId が null なら全部の組からまぜて）。間違えた組は翌日の復習へ */
export function EarSetPage({ setId }: { setId: string | null }) {
  const { dispatch } = useGame()
  const speech = useSpeechStatus()
  const set = setId === null ? null : content.earSets.find((s) => s.id === setId)
  const [session, setSession] = useState<{ questions: PracticeQuestion[]; seq: number } | null>(null)
  const close = () => dispatch({ type: 'closeStudyScene' })
  const count = content.balance.earQuestions

  if (set === undefined) {
    return (
      <ScreenLayout eyebrow="聞き分け" title="見つかりません" footer={<Button onClick={close}>戻る</Button>}>
        <Notice tone="warn">この組は見つかりませんでした。</Notice>
      </ScreenLayout>
    )
  }
  const sets = set === null ? content.earSets : [set]

  function start() {
    setSession((s) => ({ questions: earRound(sets, count, Math.random), seq: (s?.seq ?? 0) + 1 }))
  }

  const title =
    set === null ? (
      '全部の組からまぜて'
    ) : (
      <>
        {set.titleJa}
        {!set.reviewed && <DraftBadge />}
      </>
    )

  return (
    <ScreenLayout eyebrow="聞き分け" title={title} footer={<Button onClick={close}>戻る</Button>}>
      {speech.state === 'unavailable' && <Notice tone="warn">聞き分けの練習は使えません：{speech.reason}</Notice>}
      {session === null ? (
        <>
          {set !== null && <EarPreview set={set} />}
          <section className="panel">
            <p>
              音を聞いて、どれだったかを選びます（1回 {count} 問）。「ゆっくり」で何度でも聞き直せます。答えた後に、選んだ音と正解の音を聞き比べられます。
            </p>
            <Button variant="primary" onClick={start} disabled={speech.state !== 'available'}>
              練習する
            </Button>
          </section>
        </>
      ) : (
        <PracticeRunner
          key={session.seq}
          questions={session.questions}
          retry
          onAnswer={(key, correct) => dispatch({ type: 'reviewAnswered', key, correct, source: 'practice', now: nowIso() })}
          onFinish={() => dispatch({ type: 'activityCompleted', activity: 'ear', now: nowIso() })}
          finish={() => (
            <>
              <Button variant="primary" onClick={start}>
                もう一度
              </Button>
              {set !== null && <Button onClick={() => setSession(null)}>試しに聞く</Button>}
              <Button onClick={close}>組の一覧に戻る</Button>
            </>
          )}
        />
      )}
    </ScreenLayout>
  )
}
