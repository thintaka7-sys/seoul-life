import { useEffect, useRef } from 'react'
import { Notice } from '../components/Notice'
import { RewardToast } from '../components/RewardToast'
import { Backdrop } from '../components/scene/Backdrop'
import { DictionaryPage } from '../pages/DictionaryPage'
import { EventPage } from '../pages/event/EventPage'
import { LocationPage } from '../pages/LocationPage'
import { MainPage } from '../pages/MainPage'
import { OnboardingPage } from '../pages/OnboardingPage'
import { SaveErrorPage } from '../pages/SaveErrorPage'
import { SettingsPage } from '../pages/SettingsPage'
import { HangulLessonPage } from '../pages/study/HangulLessonPage'
import { HangulListPage } from '../pages/study/HangulListPage'
import { ListeningPage } from '../pages/study/ListeningPage'
import { StudyPage } from '../pages/study/StudyPage'
import { TitlePage } from '../pages/TitlePage'
import { backdropFor } from './backdrop'
import { nowIso, useGame } from './GameContext'
import { backTarget, type GameState, type Scene } from './gameState'

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
    case 'event':
      return <EventPage />
    case 'dictionary':
      return <DictionaryPage />
    case 'onboarding':
      return <OnboardingPage />
    case 'study':
      return <StudyPage />
    case 'hangul':
      return <HangulListPage />
    case 'hangulLesson':
      return <HangulLessonPage lessonId={scene.lessonId} onboarding={scene.onboarding} />
    case 'listening':
      return <ListeningPage />
    case 'saveError':
      return <SaveErrorPage reason={scene.reason} detail={scene.detail} backupKey={scene.backupKey} />
  }
}

/** 画面ごとの印（変わったら画面を作り直し、切り替えの演出を出す） */
function sceneKey(scene: Scene): string {
  if (scene.name === 'location' || scene.name === 'event') return `${scene.name}:${scene.locationId}`
  if (scene.name === 'hangulLesson') return `${scene.name}:${scene.lessonId}`
  return scene.name
}

/**
 * ブラウザ（Android）の「戻る」を、画面内の「戻る」と同じ動きにする。
 * 戻れる画面にいる間は履歴に1つ印を積んでおき、「戻る」でその印が消えたら、ゲーム内で1つ戻って印を積み直す。
 * タイトル画面では印を積まないので、「戻る」でそのままサイトを離れられる。
 */
function useBrowserBack(state: GameState, onBack: () => void) {
  const armed = useRef(false)
  const canGoBack = backTarget(state) !== null
  const onBackRef = useRef(onBack)

  useEffect(() => {
    onBackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    if (canGoBack && !armed.current) {
      window.history.pushState({ seoulLife: true }, '')
      armed.current = true
    }
  }, [canGoBack, state.scene])

  useEffect(() => {
    const handler = () => {
      if (!armed.current) return
      armed.current = false
      onBackRef.current()
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])
}

export function App() {
  const { state, dispatch } = useGame()

  useBrowserBack(state, () => dispatch({ type: 'back', now: nowIso() }))

  // 画面が切り替わったら先頭に戻す（イベントの段階が進んだときも）
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [state.scene, state.run?.step])

  const backdrop = backdropFor(state.scene, state.run)

  return (
    <div className={`app${backdrop === undefined ? '' : ' app--backdrop'}`} data-effects={state.settings.effects}>
      <Backdrop image={backdrop} />
      {(!state.storageAvailable || state.saveFailure !== null) && (
        <div className="app__banners">
          {!state.storageAvailable && (
            <Notice tone="warn">このブラウザでは進行状況を保存できません（プライベートブラウズなど）。遊ぶことはできますが、閉じると最初からになります。</Notice>
          )}
          {state.saveFailure !== null && <Notice tone="warn">保存に失敗しました：{state.saveFailure}</Notice>}
        </div>
      )}
      <SceneView key={sceneKey(state.scene)} scene={state.scene} />
      <RewardToast />
    </div>
  )
}
