import { useSyncExternalStore } from 'react'
import { Button } from '../../components/Button'
import { getPwaState, installGuide, isStandalone, promptInstall, subscribePwa } from '../../pwa/pwaState'

/** 設定画面の「ホーム画面に追加する」（PWA。GAME_SPEC 10-2・10-6） */
export function InstallSection() {
  const pwa = useSyncExternalStore(subscribePwa, getPwaState, getPwaState)
  const guide = installGuide({
    standalone: isStandalone(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    canPrompt: pwa.canPrompt,
  })

  return (
    <fieldset className="field" aria-label="ホーム画面に追加する">
      <legend>ホーム画面に追加する</legend>
      {guide === 'standalone' && <p className="small">ホーム画面から開いています。</p>}
      {guide === 'ios' && (
        <ol className="small install-steps">
          <li>Safari の共有ボタン（四角から上向きの矢印）を押す</li>
          <li>「ホーム画面に追加」を選ぶ（見当たらなければ、一覧を下へ）</li>
          <li>右上の「追加」を押す</li>
        </ol>
      )}
      {guide === 'prompt' && <Button onClick={() => void promptInstall()}>ホーム画面に追加</Button>}
      {guide === 'other' && <p className="small">ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選んでください。</p>}
      <p className="muted small">ホーム画面から開くと、アプリのように全画面で遊べ、保存データも消えにくくなります。</p>
      {guide !== 'standalone' && (
        <p className="muted small">
          iPhone では、ホーム画面のアプリと Safari とで保存場所が別になります。Safari で遊んだ続きは、Safari で「ファイルに書き出す」→ ホーム画面のアプリで「ファイルから読み込む」で引き継いでください。
        </p>
      )}
    </fieldset>
  )
}
