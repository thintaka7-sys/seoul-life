import { useState } from 'react'
import { nowIso, useGame } from '../../app/GameContext'
import { useSpeechStatus } from '../../app/hooks'
import { chapterOfKey, practiceIndex } from '../../app/practice'
import { Button } from '../../components/Button'
import { Notice } from '../../components/Notice'
import { PracticeRunner } from '../../components/practice/PracticeRunner'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'
import { buildQuestions, type PracticeQuestion } from '../../learning/practice/questions'
import { localDate } from '../../learning/review/dates'
import { dueCount, isMastered, reviewedToday, todaysReview } from '../../learning/review/review'

/** 今日の復習（GAME_SPEC 7-5）。期限の来た問題を、1日の上限まで、苦手なものから出す */
export function ReviewPage() {
  const { state, dispatch } = useGame()
  const speech = useSpeechStatus()
  const save = state.save
  const [session, setSession] = useState<{ questions: PracticeQuestion[]; seq: number } | null>(null)
  const close = () => dispatch({ type: 'closeStudyScene' })
  const settings = content.balance.review

  const today = localDate(nowIso())
  const records = save?.learning.review ?? {}
  const keys = todaysReview(records, today, settings, practiceIndex.exists)
  const due = dueCount(records, today, practiceIndex.exists)
  const doneToday = reviewedToday(records, today)
  const tracked = Object.keys(records).filter(practiceIndex.exists)
  const mastered = tracked.filter((k) => {
    const r = records[k]
    return r !== undefined && isMastered(r, settings)
  }).length

  function start() {
    if (save === null) return
    const questions = buildQuestions(practiceIndex, keys, { audio: speech.state === 'available', random: Math.random, chapterOf: chapterOfKey(save) })
    setSession((s) => ({ questions, seq: (s?.seq ?? 0) + 1 }))
  }

  let body
  if (session !== null) {
    body = (
      <PracticeRunner
        key={session.seq}
        questions={session.questions}
        retry
        onAnswer={(key, correct) => dispatch({ type: 'reviewAnswered', key, correct, source: 'review', now: nowIso() })}
        finish={() => (
          <>
            {keys.length > 0 && <p className="muted small">まだ期限の来た問題があります（{keys.length}問）。</p>}
            {keys.length > 0 && (
              <Button variant="primary" onClick={start}>
                続けて復習する
              </Button>
            )}
            <Button onClick={close}>戻る</Button>
          </>
        )}
      />
    )
  } else {
    body = (
      <section className="panel">
        <p>覚えた単語・文法や会話を、決まった間隔でもう一度解きます。正解するたびに、次に出るまでの間が延びます（1日 → 3日 → 7日 → 14日 → 30日）。間違えると、翌日にまた出ます。</p>
        <ul className="stats">
          <li>
            今日の問題：<strong>{keys.length}</strong>問
            {due > keys.length && <span className="muted small">（1日{settings.dailyLimit}問まで。残りは明日）</span>}
          </li>
          <li>
            復習中：{tracked.length - mastered}　覚えた：{mastered}
          </li>
        </ul>
        {keys.length > 0 ? (
          <Button variant="primary" onClick={start}>
            はじめる
          </Button>
        ) : (
          <Notice>{doneToday > 0 ? '今日の復習は終わりました。また明日。' : tracked.length === 0 ? 'まだ復習する問題がありません。物語を進めて単語や会話を覚えると、翌日から出るようになります。' : '今日の復習はありません。学習画面の「練習」で、学んだものを自由に練習できます。'}</Notice>
        )}
      </section>
    )
  }

  return (
    <ScreenLayout eyebrow="勉強する" title="今日の復習" footer={<Button onClick={close}>戻る</Button>}>
      {body}
    </ScreenLayout>
  )
}
