import { useEffect } from 'react'
import { useGame } from '../app/GameContext'
import { playSfx } from '../audio/sfx'
import { findLocation } from '../data'

const SHOW_MS = 2200
/** 新しい場所を知らせるときは、少し長く見せる */
const SHOW_UNLOCK_MS = 4000

/** 「経験値 +n」「図鑑に n 語」「今日のスタンプ」を少しの間だけ浮かべて見せ、効果音を鳴らす */
export function RewardToast() {
  const { state, dispatch } = useGame()
  const reward = state.reward

  useEffect(() => {
    if (reward === null) return
    if (reward.xp > 0) playSfx('xp')
    const timer = window.setTimeout(() => dispatch({ type: 'dismissReward' }), (reward.unlocked?.length ?? 0) > 0 ? SHOW_UNLOCK_MS : SHOW_MS)
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
          {reward.stamp === true && <span className="toast__words">★ 今日のスタンプ</span>}
          {(reward.unlocked ?? []).map((id) => (
            <span key={id} className="toast__words toast__unlock">
              🗺 {findLocation(id)?.nameJa ?? id}に行けるようになりました
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
