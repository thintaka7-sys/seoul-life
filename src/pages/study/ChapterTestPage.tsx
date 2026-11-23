import { useState } from 'react'
import { nowIso, useGame } from '../../app/GameContext'
import { useSpeechStatus } from '../../app/hooks'
import { conversationName, conversationPlace } from '../../app/conversationNames'
import { chapterOfKey, practiceIndex } from '../../app/practice'
import { Button } from '../../components/Button'
import { DraftBadge } from '../../components/DraftBadge'
import { Notice } from '../../components/Notice'
import { PracticeRunner } from '../../components/practice/PracticeRunner'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content, findVocab } from '../../data'
import { conversationEntries } from '../../game/conversations/replayList'
import { chapterTestKeys, pickTestKeys, testProgress, testSettings } from '../../game/tests/chapterTest'
import { formKeysOf } from '../../learning/forms/forms'
import { quizScore } from '../../learning/hangul/quiz'
import { buildQuestions, type PracticeQuestion } from '../../learning/practice/questions'
import { correctCount } from '../../learning/practice/round'

/** 章末テスト（GAME_SPEC 4-9）。間違えた問題は復習に入る。初めて合格したときに経験値（計画 Q11） */
export function ChapterTestPage({ testId }: { testId: string }) {
  const { state, dispatch } = useGame()
  const speech = useSpeechStatus()
  const save = state.save
  const test = content.chapterTests.find((t) => t.id === testId)
  const [session, setSession] = useState<{ questions: PracticeQuestion[]; seq: number } | null>(null)
  const close = () => dispatch({ type: 'closeStudyScene' })

  if (test === undefined || save === null) {
    return (
      <ScreenLayout eyebrow="章末テスト" title="見つかりません" footer={<Button onClick={close}>戻る</Button>}>
        <Notice tone="warn">このテストは見つかりませんでした。</Notice>
      </ScreenLayout>
    )
  }
  const { count, passPercent } = testSettings(test, content.balance)
  const progress = testProgress(test, content.conversations, save.learning.conversations)
  const keys = chapterTestKeys(test, { ...content, formKeysOf: (id) => formKeysOf(findVocab(id)) }).filter(practiceIndex.exists)
  const record = save.learning.tests[test.id]

  function start() {
    if (test === undefined || save === null) return
    const picked = pickTestKeys(keys, count, Math.random)
    const questions = buildQuestions(practiceIndex, picked, { audio: speech.state === 'available', random: Math.random, chapterOf: chapterOfKey(save) })
    setSession((s) => ({ questions, seq: (s?.seq ?? 0) + 1 }))
  }

  const title = (
    <>
      {test.titleJa}
      {!test.reviewed && <DraftBadge />}
    </>
  )

  let body
  if (!progress.unlocked) {
    // 残っている会話と、どこで遊べるかを出す（BUG-007）
    const remaining = conversationEntries(content.events, content.conversations, save.progress.completedEvents, save.learning.conversations).filter(
      (e) => e.conversation.chapter === test.chapter && e.answered < e.total,
    )
    body = (
      <section className="panel">
        <p>
          第{test.chapter}章の会話の問題に、すべて答えると受けられます（{progress.answered} / {progress.total}）。
        </p>
        {remaining.length > 0 && (
          <>
            <p className="step-heading">まだ答えていない会話</p>
            <ul className="lesson-list">
              {remaining.map((e) => (
                <li key={e.conversation.id} className="remaining-conversation">
                  <span className="lesson-item__title">
                    {conversationName(e)}
                    <span className="muted small">
                      {conversationPlace(e)}・<span className="nowrap">問題 {e.answered} / {e.total}</span>
                    </span>
                  </span>
                  {e.playable ? (
                    <Button onClick={() => dispatch({ type: 'openConversationReplay', conversationId: e.conversation.id })}>遊ぶ</Button>
                  ) : (
                    <span className="muted small">物語の「{e.event.actionJa}」で出てきます</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted small">終えた会話は、学習画面の「会話をもう一度」からも遊べます。</p>
          </>
        )}
      </section>
    )
  } else if (session === null) {
    body = (
      <section className="panel">
        <p>
          第{test.chapter}章で学んだ単語・文法・会話から {Math.min(count, keys.length)} 問出ます。{passPercent}点以上で合格です。
        </p>
        <p className="muted small">間違えた問題は、明日の復習にもう一度出ます。</p>
        {record !== undefined && <p className="muted small">{record.passedAt !== null ? `合格済み（いちばん良い点：${record.bestScore}点）` : `いちばん良い点：${record.bestScore}点`}</p>}
        <Button variant="primary" onClick={start} disabled={keys.length === 0}>
          はじめる
        </Button>
      </section>
    )
  } else {
    body = (
      <PracticeRunner
        key={session.seq}
        questions={session.questions}
        retry={false}
        onAnswer={(key, correct) => dispatch({ type: 'reviewAnswered', key, correct, source: 'practice', now: nowIso() })}
        onFinish={(round) => {
          const { score, passed } = quizScore(correctCount(round), round.firstCount, passPercent)
          dispatch({ type: 'testFinished', testId: test.id, score, passed, now: nowIso() })
        }}
        summary={(round) => {
          const { score, passed } = quizScore(correctCount(round), round.firstCount, passPercent)
          return passed ? (
            <p className="correct">合格！（{score}点）</p>
          ) : (
            <Notice tone="warn">
              {score}点。{passPercent}点以上で合格です。復習してから、もう一度挑戦してみましょう。
            </Notice>
          )
        }}
        finish={() => (
          <>
            <Button variant="primary" onClick={start}>
              もう一度受ける
            </Button>
            <Button onClick={close}>一覧に戻る</Button>
          </>
        )}
      />
    )
  }

  return (
    <ScreenLayout eyebrow="章末テスト" title={title} footer={<Button onClick={close}>戻る</Button>}>
      {body}
    </ScreenLayout>
  )
}
