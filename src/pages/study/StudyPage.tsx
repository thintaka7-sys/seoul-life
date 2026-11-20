import { nowIso, useGame } from '../../app/GameContext'
import { practiceIndex } from '../../app/practice'
import { localDate } from '../../learning/review/dates'
import { todaysReview } from '../../learning/review/review'
import { useSpeechStatus } from '../../app/hooks'
import { Button } from '../../components/Button'
import { Hud } from '../../components/Hud'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'

/** 学習画面（GAME_SPEC 3-1 E）。今日の復習・練習（Phase 2.5）、ハングルとリスニング（Phase 2） */
export function StudyPage() {
  const { state, dispatch } = useGame()
  const speech = useSpeechStatus()
  const lessons = content.hangulLessons
  const passed = lessons.filter((l) => state.save?.learning.hangul[l.id] !== undefined).length
  const reviewToday = state.save === null ? 0 : todaysReview(state.save.learning.review, localDate(nowIso()), content.balance.review, practiceIndex.exists).length

  return (
    <ScreenLayout eyebrow="学習" title="勉強する" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      <Hud />
      <div className="panel actions">
        <Button variant="primary" onClick={() => dispatch({ type: 'openReview' })}>
          今日の復習（{reviewToday}問）
        </Button>
        <p className="muted small">覚えたものを、決まった間隔でもう一度解きます。</p>

        <Button onClick={() => dispatch({ type: 'openPractice' })}>練習</Button>
        <p className="muted small">学んだ単語・文法・会話を、自由に練習します。</p>
      </div>
      <div className="panel actions">
        <Button onClick={() => dispatch({ type: 'openHangul' })} disabled={lessons.length === 0}>
          ハングル（{passed} / {lessons.length} レッスン合格）
        </Button>
        <p className="muted small">文字の読み方と、音と文字の結びつきを学びます。</p>

        <Button onClick={() => dispatch({ type: 'openListening' })} disabled={speech.state !== 'available'}>
          リスニング
        </Button>
        {speech.state === 'unavailable' ? (
          <p className="muted small">リスニングは使えません：{speech.reason}</p>
        ) : (
          <p className="muted small">覚えた単語や会話を聞いて、答えを選びます。</p>
        )}
      </div>
    </ScreenLayout>
  )
}
