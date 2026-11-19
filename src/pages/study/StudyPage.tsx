import { useGame } from '../../app/GameContext'
import { useSpeechStatus } from '../../app/hooks'
import { Button } from '../../components/Button'
import { Hud } from '../../components/Hud'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'

/** 学習画面（GAME_SPEC 3-1 E）。Phase 2 はハングルとリスニング */
export function StudyPage() {
  const { state, dispatch } = useGame()
  const speech = useSpeechStatus()
  const lessons = content.hangulLessons
  const passed = lessons.filter((l) => state.save?.learning.hangul[l.id] !== undefined).length

  return (
    <ScreenLayout eyebrow="学習" title="勉強する" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      <Hud />
      <div className="panel actions">
        <Button variant="primary" onClick={() => dispatch({ type: 'openHangul' })} disabled={lessons.length === 0}>
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
