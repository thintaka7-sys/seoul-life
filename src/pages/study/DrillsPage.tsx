import { useGame } from '../../app/GameContext'
import { Button } from '../../components/Button'
import { DraftBadge } from '../../components/DraftBadge'
import { Notice } from '../../components/Notice'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'
import { testProgress } from '../../game/tests/chapterTest'

/** 基礎ドリルと章末テストの一覧（GAME_SPEC 4-9）。ドリルは物語と関係なく、いつでも選べる（計画 Q9） */
export function DrillsPage() {
  const { state, dispatch } = useGame()
  const save = state.save
  const noHangul = save !== null && Object.keys(save.learning.hangul).length === 0 && content.hangulLessons.length > 0

  return (
    <ScreenLayout eyebrow="勉強する" title="ドリル・テスト" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      {noHangul && <Notice>ハングルがまだ読めないときは、先に「ハングル」のレッスンから始めるのがおすすめです。</Notice>}
      <section className="panel" aria-labelledby="drills-heading">
        <h2 id="drills-heading" className="step-heading">基礎ドリル</h2>
        <p className="muted small">数字・曜日など、毎日の暮らしで使う基礎を練習します。数字は入力で答えます。</p>
        {content.drills.length === 0 ? (
          <p>まだドリルがありません。</p>
        ) : (
          <ol className="lesson-list">
            {content.drills.map((drill) => {
              const correct = drill.items.filter((i) => save?.learning.drills[i.id] !== undefined).length
              return (
                <li key={drill.id}>
                  <button type="button" className="lesson-item lesson-item--plain" onClick={() => dispatch({ type: 'openDrill', drillId: drill.id })}>
                    <span className="lesson-item__title">
                      {drill.titleJa}
                      {!drill.reviewed && <DraftBadge />}
                    </span>
                    <span className={`lesson-item__status${correct === drill.items.length ? ' lesson-item__status--passed' : ''}`}>
                      正解 {correct} / {drill.items.length}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="panel" aria-labelledby="tests-heading">
        <h2 id="tests-heading" className="step-heading">章末テスト</h2>
        <p className="muted small">章の内容を確かめるテストです。その章の会話の問題に、すべて一度答えると受けられます。</p>
        {content.chapterTests.length === 0 ? (
          <p>まだテストがありません。</p>
        ) : (
          <ol className="lesson-list">
            {content.chapterTests.map((test) => {
              const progress = testProgress(test, content.conversations, save?.learning.conversations ?? {})
              const record = save?.learning.tests[test.id]
              const status = !progress.unlocked
                ? `会話 ${progress.answered} / ${progress.total}`
                : record === undefined
                  ? '未受験'
                  : record.passedAt !== null
                    ? `合格（${record.bestScore}点）`
                    : `最高 ${record.bestScore}点`
              return (
                <li key={test.id}>
                  <button
                    type="button"
                    className="lesson-item lesson-item--plain"
                    disabled={!progress.unlocked}
                    onClick={() => dispatch({ type: 'openChapterTest', testId: test.id })}
                  >
                    <span className="lesson-item__title">
                      {test.titleJa}
                      {!test.reviewed && <DraftBadge />}
                    </span>
                    <span className={`lesson-item__status${record?.passedAt ? ' lesson-item__status--passed' : ''}`}>{status}</span>
                  </button>
                  {!progress.unlocked && (
                    <p className="muted small">
                      {progress.total === 0 ? 'この章の会話がまだありません。' : `第${test.chapter}章の会話の問題（${progress.total}問）に、すべて答えると受けられます。`}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </ScreenLayout>
  )
}
