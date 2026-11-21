import { useGame } from '../../app/GameContext'
import { useSpeechStatus } from '../../app/hooks'
import { Button } from '../../components/Button'
import { DraftBadge } from '../../components/DraftBadge'
import { Notice } from '../../components/Notice'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'
import { EAR_THEME_LABELS, EAR_THEMES } from '../../data/types'
import { isMastered, reviewKey } from '../../learning/review/review'

/** 聞き分け練習（GAME_SPEC 4-10）：組の一覧。テーマごとにまとめ、組を選ぶと試しに聞いてから練習できる */
export function EarListPage() {
  const { state, dispatch } = useGame()
  const speech = useSpeechStatus()
  const records = state.save?.learning.review ?? {}
  const settings = content.balance.review

  function status(setId: string): string {
    const r = records[reviewKey('ear', setId)]
    if (r === undefined) return ''
    return isMastered(r, settings) ? '覚えた' : '復習中'
  }

  return (
    <ScreenLayout eyebrow="勉強する" title="聞き分け" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      <section className="panel actions">
        <p className="panel-text">
          日本語にない、似た音を聞き分ける練習です。組の中の1つを読み上げるので、どれだったかを選びます。組を選ぶと、先に音を試しに聞けます。間違えた組は、明日の復習にもう一度出ます。
        </p>
        {speech.state === 'unavailable' && <Notice tone="warn">聞き分けの練習は使えません：{speech.reason}</Notice>}
        <Button variant="primary" onClick={() => dispatch({ type: 'openEarSet', setId: null })} disabled={speech.state !== 'available' || content.earSets.length === 0}>
          全部の組からまぜて練習（{content.balance.earQuestions}問）
        </Button>
      </section>
      {EAR_THEMES.map((theme) => {
        const sets = content.earSets.filter((s) => s.theme === theme)
        if (sets.length === 0) return null
        return (
          <section key={theme} className="panel" aria-labelledby={`ear-${theme}`}>
            <h2 id={`ear-${theme}`} className="step-heading">
              {EAR_THEME_LABELS[theme]}
            </h2>
            <ol className="lesson-list">
              {sets.map((set) => {
                const s = status(set.id)
                return (
                  <li key={set.id}>
                    <button type="button" className="lesson-item lesson-item--plain" onClick={() => dispatch({ type: 'openEarSet', setId: set.id })}>
                      <span className="lesson-item__title">
                        {set.titleJa}
                        {!set.reviewed && <DraftBadge />}
                        <span className="muted small">{set.focusJa}</span>
                      </span>
                      {s !== '' && <span className={`lesson-item__status${s === '覚えた' ? ' lesson-item__status--passed' : ''}`}>{s}</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </ScreenLayout>
  )
}
