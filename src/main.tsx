import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { boot } from './app/boot'
import { GameProvider } from './app/GameProvider'
import { initAudioSession } from './audio/audioSession'
import { initBgm } from './audio/bgm'
import { initSfx } from './audio/sfx'
import { initSpeech } from './audio/speech'
import { getBrowserStorage } from './storage/browserStorage'
import './styles/global.css'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('#root が見つかりません')

// セーブデータの読み込みは描画の前に1回だけ行う（StrictMode の二重実行の影響を受けないように）
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const bootResult = boot(getBrowserStorage(), new Date(), prefersReducedMotion)
initAudioSession()
initSpeech()
initSfx()
initBgm()

createRoot(rootElement).render(
  <StrictMode>
    <GameProvider boot={bootResult}>
      <App />
    </GameProvider>
  </StrictMode>,
)
