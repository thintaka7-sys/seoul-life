import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { boot } from './app/boot'
import { GameProvider } from './app/GameProvider'
import { initAudioDebug, isAudioDebugEnabled } from './audio/audioDebug'
import { hasAudioSession, initAudioSession } from './audio/audioSession'
import { initBgm } from './audio/bgm'
import { initPageVisibility } from './audio/pageVisibility'
import { initSfx } from './audio/sfx'
import { initSpeech } from './audio/speech'
import { initPwa } from './pwa/register'
import { AudioDebugPanel } from './components/AudioDebugPanel'
import { getBrowserStorage } from './storage/browserStorage'
import { initPersistence } from './storage/persist'
import './styles/global.css'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('#root が見つかりません')

// セーブデータの読み込みは描画の前に1回だけ行う（StrictMode の二重実行の影響を受けないように）
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const bootResult = boot(getBrowserStorage(), new Date(), { prefersReducedMotion, hasAudioSession: hasAudioSession() })
// 音の記録（?debug=audio のときだけ）は、音の部品より先に始める
initAudioDebug()
initAudioSession()
initSpeech()
initSfx()
initBgm()
initPageVisibility()
// 保存データを消さないようブラウザに求める（GAME_SPEC 10-2）。PWA（ホーム画面への追加・新しい版の知らせ）
initPersistence()
initPwa()

createRoot(rootElement).render(
  <StrictMode>
    <GameProvider boot={bootResult}>
      <App />
    </GameProvider>
    {isAudioDebugEnabled() && <AudioDebugPanel />}
  </StrictMode>,
)
