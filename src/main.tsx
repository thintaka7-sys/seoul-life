import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { boot } from './app/boot'
import { GameProvider } from './app/GameProvider'
import { getBrowserStorage } from './storage/browserStorage'
import './styles/global.css'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('#root が見つかりません')

// セーブデータの読み込みは描画の前に1回だけ行う（StrictMode の二重実行の影響を受けないように）
const bootResult = boot(getBrowserStorage(), new Date())

createRoot(rootElement).render(
  <StrictMode>
    <GameProvider boot={bootResult}>
      <App />
    </GameProvider>
  </StrictMode>,
)
