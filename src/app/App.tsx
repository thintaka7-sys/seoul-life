import { useEffect } from 'react'
import { Notice } from '../components/Notice'
import { ConversationPage } from '../pages/ConversationPage'
import { LocationPage } from '../pages/LocationPage'
import { MainPage } from '../pages/MainPage'
import { SaveErrorPage } from '../pages/SaveErrorPage'
import { SettingsPage } from '../pages/SettingsPage'
import { TitlePage } from '../pages/TitlePage'
import { useGame } from './GameContext'
import type { Scene } from './gameState'

function SceneView({ scene }: { scene: Scene }) {
  switch (scene.name) {
    case 'title':
      return <TitlePage />
    case 'settings':
      return <SettingsPage />
    case 'main':
      return <MainPage />
    case 'location':
      return <LocationPage locationId={scene.locationId} />
    case 'conversation':
      return <ConversationPage conversationId={scene.conversationId} />
    case 'saveError':
      return <SaveErrorPage reason={scene.reason} detail={scene.detail} backupKey={scene.backupKey} />
  }
}

export function App() {
  const { state } = useGame()

  // 画面が切り替わったら先頭に戻す
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [state.scene])

  return (
    <div className="app">
      {(!state.storageAvailable || state.saveFailure !== null) && (
        <div className="app__banners">
          {!state.storageAvailable && (
            <Notice tone="warn">このブラウザでは進行状況を保存できません（プライベートブラウズなど）。遊ぶことはできますが、閉じると最初からになります。</Notice>
          )}
          {state.saveFailure !== null && <Notice tone="warn">保存に失敗しました：{state.saveFailure}</Notice>}
        </div>
      )}
      <SceneView scene={state.scene} />
    </div>
  )
}
