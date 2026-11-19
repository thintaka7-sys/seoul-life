import { useEffect } from 'react'
import { useGame } from '../app/GameContext'
import { playSfx } from '../audio/sfx'

const SHOW_MS = 2200

/** 「経験値 +n」「図鑑に n 語」を少しの間だけ浮かべて見せ、効果音を鳴らす */
export function RewardToast() {
  const { state, dispatch } = useGame()
  const reward = state.reward

  useEffect(() => {
    if (reward === null) return
    if (reward.xp > 0) playSfx('xp')
    const timer = window.setTimeout(() => dispatch({ type: 'dismissReward' }), SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [reward, dispatch])

  return (
    <div className="toast-area" aria-live="polite">
      {reward !== null && (
        <div className="toast" key={reward.seq}>
          {reward.xp > 0 && (
            <span className="toast__xp">
              <span className="toast__plus">+{reward.xp}</span> 経験値
            </span>
          )}
          {reward.newWords > 0 && <span className="toast__words">図鑑に {reward.newWords} 語</span>}
        </div>
      )}
    </div>
  )
}
