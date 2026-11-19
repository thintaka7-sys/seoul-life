import { useGame } from '../app/GameContext'
import { Button } from '../components/Button'
import { content } from '../data'

/** 「はじめから」の直後に1度だけ聞く：ハングルから学ぶか、このまま物語を始めるか */
export function OnboardingPage() {
  const { dispatch } = useGame()
  const first = content.hangulLessons[0]
  return (
    <main className="screen screen--title">
      <div className="title-card onboarding">
        <h1 className="screen__title">ハングルは読めますか？</h1>
        <p>韓国語の文字（ハングル）は、母音と子音の組み合わせでできています。読めなくても大丈夫。最初の文字から学べます。</p>
        <div className="menu">
          <Button variant="primary" onClick={() => dispatch({ type: 'chooseOnboarding', learnHangul: true })}>
            ハングルから学ぶ{first !== undefined && `（${first.titleJa}）`}
          </Button>
          <Button onClick={() => dispatch({ type: 'chooseOnboarding', learnHangul: false })}>このまま物語を始める</Button>
        </div>
        <p className="muted small">ハングルのレッスンは、あとで自宅の「勉強する」からいつでも進められます。</p>
      </div>
    </main>
  )
}
