import { useEffect } from 'react'
import { useGame } from '../app/GameContext'
import { content, findLocation } from '../data'
import { allEventsCompleted, nextEvent } from '../game/events/events'
import { levelProgress } from '../game/progression/level'
import { useCountUp } from './useCountUp'

/** 最後に見せた経験値（イベントの間は HUD を出さないので、戻ったときにここから増やして見せる） */
let lastShownXp: number | null = null

/** レベル・経験値（次のレベルまで）・コインと、いまの目標を表示する（GAME_SPEC 3-1 B） */
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
  const level = levelProgress(value, content.balance.levels)

  return (
    <div className="hud">
      <p className="hud__xp">
        <span className="hud__level">Lv.{level.level}</span>
        <span>
          経験値 <strong className="hud__xp-value">{xp}</strong>
          <span className="hud__next"> / {level.nextAt}</span>
        </span>
        <span className="hud__coins">
          コイン <strong className="hud__coins-value">{save.stats.coins}</strong>
        </span>
      </p>
      <div className="hud__bar" role="progressbar" aria-label="次のレベルまで" aria-valuemin={0} aria-valuemax={level.needed} aria-valuenow={level.current}>
        <span className="hud__bar-fill" style={{ width: `${Math.round((level.current / level.needed) * 100)}%` }} />
      </div>
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
