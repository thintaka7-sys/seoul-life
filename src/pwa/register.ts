// Service Worker の登録と、ホーム画面への追加の確認の受け取り（PWA。GAME_SPEC 10-6）。起動時に1回呼ぶ。
// 新しい版は自動では切り替えず、画面に「新しい版があります」を出して、押したら切り替える（Phase 4 計画 Q12）。
// 新しい版があるかは、起動時・画面に戻ったとき・1時間ごとに確かめる（ホーム画面のアプリは、開き直さずに使い続けることが多いため）。

import { registerSW } from 'virtual:pwa-register'
import { markUpdateReady, setInstallPrompt, type InstallPromptEvent } from './pwaState'

const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function initPwa(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    // ブラウザがすぐに出す案内は止め、設定画面のボタンで出す
    e.preventDefault()
    setInstallPrompt(e as InstallPromptEvent)
  })
  window.addEventListener('appinstalled', () => setInstallPrompt(null))
  if (!('serviceWorker' in navigator)) return

  const updateSW = registerSW({
    onNeedRefresh() {
      markUpdateReady(() => void updateSW(true))
    },
    onRegisteredSW(_url, registration) {
      if (registration === undefined) return
      const check = () => void registration.update().catch(() => undefined)
      window.setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
