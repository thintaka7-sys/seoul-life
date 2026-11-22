import { useGame, nowIso } from '../../app/GameContext'
import { Button } from '../../components/Button'
import { TeacherSays } from '../../components/TeacherCall'
import { content } from '../../data'

/**
 * 物語の中で「ハングルは読めますか？」と聞く（hangulIntro の段階。第1章の先生の授業。計画 Q3）。
 * 「ハングルから学ぶ」でレッスン1を開き、閉じると物語に戻る
 */
export function HangulIntroStep() {
  const { dispatch } = useGame()
  const first = content.hangulLessons[0]
  return (
    <div className="hangul-intro">
      <h2 className="section-title">ハングルは読めますか？</h2>
      <TeacherSays paragraphs={['韓国語の文字（ハングル）は、母音と子音の組み合わせでできています。読めなくても大丈夫。最初の文字から一緒に学びましょう。']} />
      <div className="menu">
        <Button variant="primary" onClick={() => dispatch({ type: 'answerHangulIntro', learnHangul: true, now: nowIso() })}>
          ハングルから学ぶ{first !== undefined && `（${first.titleJa}）`}
        </Button>
        <Button onClick={() => dispatch({ type: 'answerHangulIntro', learnHangul: false, now: nowIso() })}>このまま物語を進める</Button>
      </div>
      <p className="muted small">ハングルのレッスンは、あとで自宅の「勉強する」からいつでも進められます。</p>
    </div>
  )
}
