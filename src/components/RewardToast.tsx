import { useEffect } from 'react'
import { useGame } from '../app/GameContext'

const SHOW_MS = 2500

/** 「経験値 +n」「図鑑に n 語」を少しの間だけ表示する */
export function RewardToast() {
  const { state, dispatch } = useGame()
  const reward = state.reward

  useEffect(() => {
    if (reward === null) return
    const timer = window.setTimeout(() => dispatch({ type: 'dismissReward' }), SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [reward, dispatch])

  return (
    <div className="toast-area" aria-live="polite">
      {reward !== null && (
        <div className="toast" key={reward.seq}>
          {reward.xp > 0 && <span>経験値 +{reward.xp}</span>}
          {reward.newWords > 0 && <span>図鑑に {reward.newWords} 語</span>}
        </div>
      )}
    </div>
  )
}
