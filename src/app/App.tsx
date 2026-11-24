import { useEffect, useRef } from 'react'
import { Notice } from '../components/Notice'
import { RewardToast } from '../components/RewardToast'
import { Backdrop } from '../components/scene/Backdrop'
import { DictionaryPage } from '../pages/DictionaryPage'
import { EventPage } from '../pages/event/EventPage'
import { LocationPage } from '../pages/LocationPage'
import { MainPage } from '../pages/MainPage'
import { SaveErrorPage } from '../pages/SaveErrorPage'
import { SettingsPage } from '../pages/SettingsPage'
import { HangulLessonPage } from '../pages/study/HangulLessonPage'
import { HangulListPage } from '../pages/study/HangulListPage'
import { ListeningPage } from '../pages/study/ListeningPage'
import { PracticePage } from '../pages/study/PracticePage'
import { ChapterTestPage } from '../pages/study/ChapterTestPage'
import { DrillPage } from '../pages/study/DrillPage'
import { EarListPage } from '../pages/study/EarListPage'
import { EarSetPage } from '../pages/study/EarSetPage'
import { DrillsPage } from '../pages/study/DrillsPage'
import { StampCardPage } from '../pages/StampCardPage'
import { AchievementsPage } from '../pages/AchievementsPage'
import { ConversationListPage } from '../pages/study/ConversationListPage'
import { ConversationReplayPage } from '../pages/study/ConversationReplayPage'
import { ReviewPage } from '../pages/study/ReviewPage'
import { StudyPage } from '../pages/study/StudyPage'
import { AlbumPage } from '../pages/AlbumPage'
import { OrderPage } from '../pages/OrderPage'
import { StoryReplayPage } from '../pages/StoryReplayPage'
import { setBgm } from '../audio/bgm'
import { backgroundImage } from '../data'
import { bgmFor } from './bgmScene'
import { useBackdropOverride, useBgmOverride } from './overrides'
import { TitlePage } from '../pages/TitlePage'
import { OVERLAY_ROOT_ID } from '../components/Overlay'
import { backdropFor } from './backdrop'
import { nowIso, useGame } from './GameContext'
import { backTarget, type GameState, type Scene } from './gameState'

function SceneView({ scene }: { scene: Scene }) {
  switch (scene.name) {
    case 'title':
      return <TitlePage imported={scene.imported} />
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
    case 'study':
      return <StudyPage />
    case 'hangul':
      return <HangulListPage />
    case 'hangulLesson':
      return <HangulLessonPage lessonId={scene.lessonId} onboarding={scene.onboarding} />
    case 'listening':
      return <ListeningPage />
    case 'review':
      return <ReviewPage />
    case 'practice':
      return <PracticePage />
    case 'drills':
      return <DrillsPage />
    case 'drill':
      return <DrillPage drillId={scene.drillId} />
    case 'chapterTest':
      return <ChapterTestPage testId={scene.testId} />
    case 'stamps':
      return <StampCardPage />
    case 'achievements':
      return <AchievementsPage />
    case 'ear':
      return <EarListPage />
    case 'earSet':
      return <EarSetPage setId={scene.setId} />
    case 'conversations':
      return <ConversationListPage />
    case 'conversationReplay':
      return <ConversationReplayPage conversationId={scene.conversationId} />
    case 'album':
      return <AlbumPage />
    case 'storyReplay':
      return <StoryReplayPage storyId={scene.storyId} />
    case 'order':
      return <OrderPage orderId={scene.orderId} />
    case 'saveError':
      return <SaveErrorPage reason={scene.reason} detail={scene.detail} backupKey={scene.backupKey} />
  }
}

/** 画面ごとの印（変わったら画面を作り直し、切り替えの演出を出す） */
function sceneKey(scene: Scene): string {
  if (scene.name === 'location' || scene.name === 'event') return `${scene.name}:${scene.locationId}`
  if (scene.name === 'hangulLesson') return `${scene.name}:${scene.lessonId}`
  if (scene.name === 'drill') return `${scene.name}:${scene.drillId}`
  if (scene.name === 'chapterTest') return `${scene.name}:${scene.testId}`
  if (scene.name === 'conversationReplay') return `${scene.name}:${scene.conversationId}`
  if (scene.name === 'earSet') return `${scene.name}:${scene.setId ?? 'mix'}`
  if (scene.name === 'storyReplay') return `${scene.name}:${scene.storyId}`
  if (scene.name === 'order') return `${scene.name}:${scene.orderId}`
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

  // おはなしの場面で変えた背景があれば、それを敷く（画像がなければ、ふだんの背景）
  const override = useBackdropOverride()
  const backdrop = (override === null ? undefined : backgroundImage(override)) ?? backdropFor(state.scene, state.run)

  // 場面に合わせて BGM を流す（おはなしで指定した曲があれば、それ）
  const bgmOverride = useBgmOverride()
  const bgm = bgmFor(state.scene, bgmOverride)
  useEffect(() => {
    setBgm(bgm.track, bgm.level)
  }, [bgm.track, bgm.level])

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
      <div id={OVERLAY_ROOT_ID} />
    </div>
  )
}
