import { useEffect } from 'react'
import { useGame } from '../app/GameContext'
import { content, findLocation } from '../data'
import { allEventsCompleted, nextEvent } from '../game/events/events'
import { useCountUp } from './useCountUp'

/** 最後に見せた経験値（イベントの間は HUD を出さないので、戻ったときにここから増やして見せる） */
let lastShownXp: number | null = null

/** 経験値の合計と、いまの目標を表示する */
export function Hud() {
  const { state } = useGame()
  const save = state.save
  const value = save?.stats.xp ?? 0
  const xp = useCountUp(value, state.settings.effects === 'normal', lastShownXp !== null && lastShownXp <= value ? lastShownXp : value)
  useEffect(() => {
    lastShownXp = value
  }, [value])
  if (save === null) return null
  const next = nextEvent(content.events, save.progress)
  const place = next === undefined ? undefined : findLocation(next.location)
  const done = allEventsCompleted(content.events, save.progress)

  return (
    <div className="hud">
      <p className="hud__xp">
        経験値 <strong className="hud__xp-value">{xp}</strong>
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
