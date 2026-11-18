import { useGame } from '../app/GameContext'
import { content, findLocation } from '../data'
import { allEventsCompleted, nextEvent } from '../game/events/events'

/** 経験値の合計と、いまの目標を表示する */
export function Hud() {
  const { state } = useGame()
  const save = state.save
  if (save === null) return null
  const next = nextEvent(content.events, save.progress)
  const place = next === undefined ? undefined : findLocation(next.location)
  const done = allEventsCompleted(content.events, save.progress)

  return (
    <div className="hud">
      <p className="hud__xp">
        経験値 <strong>{save.stats.xp}</strong>
      </p>
      {next !== undefined ? (
        <p className="hud__objective">
          <span className="hud__label">目標</span>
          {next.objectiveJa}
          {place !== undefined && <span className="hud__place">（{place.nameJa}）</span>}
        </p>
      ) : done ? (
        <p className="hud__objective">
          <span className="hud__label">目標</span>最初の1日をクリアしました。好きな場所で遊び直せます
        </p>
      ) : null}
    </div>
  )
}
