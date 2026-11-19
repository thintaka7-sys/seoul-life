import { useGame } from '../../app/GameContext'
import { Button } from '../../components/Button'
import { DraftBadge } from '../../components/DraftBadge'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'

/** ハングルのレッスンの一覧。どのレッスンも選べる。おすすめは上から順（GAME_SPEC 4-1、計画 Q2） */
export function HangulListPage() {
  const { state, dispatch } = useGame()
  return (
    <ScreenLayout eyebrow="勉強する" title="ハングル" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      <p className="panel-text">おすすめは上から順番です。読める文字があれば、どのレッスンから始めてもかまいません。</p>
      <ol className="lesson-list">
        {content.hangulLessons.map((lesson) => {
          const record = state.save?.learning.hangul[lesson.id]
          return (
            <li key={lesson.id}>
              <button type="button" className="lesson-item" onClick={() => dispatch({ type: 'openHangulLesson', lessonId: lesson.id })}>
                <span className="lesson-item__order">{lesson.order}</span>
                <span className="lesson-item__title">
                  {lesson.titleJa}
                  {!lesson.reviewed && <DraftBadge />}
                </span>
                <span className={`lesson-item__status${record === undefined ? '' : ' lesson-item__status--passed'}`}>
                  {record === undefined ? '未合格' : `合格（${record.bestScore}点）`}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </ScreenLayout>
  )
}
