import { useGame } from '../app/GameContext'
import { formatDateTime } from '../app/saveSummary'
import { Button } from '../components/Button'
import { ScreenLayout } from '../components/ScreenLayout'
import { content } from '../data'
import type { Achievement } from '../data/types'
import { achievementValue } from '../game/progression/growth'
import type { SaveData } from '../storage/saveData'

/** まだのときの進み具合（「12/30」）。章を終える実績には出さない */
function progressText(a: Achievement, save: SaveData): string | null {
  if (a.condition.type === 'chapterCleared') return null
  const value = Math.min(achievementValue(a.condition, save, content), a.condition.target)
  return `${value} / ${a.condition.target}`
}

/** 実績の一覧（GAME_SPEC 7-2・7-3）。達成したものも、まだのものも、データの順に並べる */
export function AchievementsPage() {
  const { state, dispatch } = useGame()
  const save = state.save
  if (save === null) return null
  const done = content.achievements.filter((a) => save.achievements[a.id] !== undefined).length

  return (
    <ScreenLayout eyebrow="自宅" title="実績" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      <section className="panel">
        <p>
          達成した実績：<strong>{done}</strong> / {content.achievements.length}
        </p>
        <p className="muted small">実績を達成すると、コインがもらえます。コインは、自宅に飾る家具を買うのに使えます（準備中）。</p>
      </section>
      <ul className="achievement-list">
        {content.achievements.map((a) => {
          const record = save.achievements[a.id]
          const progress = record === undefined ? progressText(a, save) : null
          return (
            <li key={a.id} className={record === undefined ? 'achievement' : 'achievement achievement--done'} data-id={a.id}>
              <span className="achievement__mark" aria-hidden="true">
                {record === undefined ? '・' : '🏆'}
              </span>
              <div className="achievement__body">
                <p className="achievement__title">
                  {a.titleJa}
                  <span className="visually-hidden">{record === undefined ? '（まだ）' : '（達成）'}</span>
                </p>
                <p className="achievement__desc">{a.descriptionJa}</p>
                <p className="achievement__meta">
                  {record === undefined ? (progress === null ? 'まだ' : `いま ${progress}`) : `${formatDateTime(record.at)} に達成`}
                  <span className="achievement__coins">コイン {a.coins}</span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </ScreenLayout>
  )
}
