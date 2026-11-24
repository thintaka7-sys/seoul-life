import { useSyncExternalStore } from 'react'
import { applyUpdate, getPwaState, subscribePwa } from '../pwa/pwaState'
import { Button } from './Button'

/** 新しい版を受け取ったときの知らせ（PWA。Phase 4 計画 Q12）。押すまでは切り替えない */
export function UpdateBanner() {
  const { updateReady } = useSyncExternalStore(subscribePwa, getPwaState, getPwaState)
  if (!updateReady) return null
  return (
    <div className="notice notice--info update-banner" role="status">
      <p>新しい版があります。</p>
      <Button variant="primary" onClick={applyUpdate}>
        更新する
      </Button>
    </div>
  )
}
