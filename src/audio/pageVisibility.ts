// 画面が見えなくなったら音を止め、戻ったら BGM を続きから流す。
// 別のタブに切り替えた・ホーム画面に戻った・アプリを切り替えたときに、BGM・効果音・読み上げが鳴り続けないようにする。
// - 見えなくなった：visibilitychange（hidden）・pagehide。どちらか先に来たほうで1回だけ止める
// - 戻った：visibilitychange（visible）・pageshow（戻るボタンでページを復元したときなど）。1回だけ再開する
// iPhone の Safari と、ホーム画面に追加したとき（standalone）のどちらも、この2組のイベントが届く。

import { resumeBgm, suspendBgm } from './bgm'
import { resumeAudioEngine, suspendAudioEngine } from './engine'
import { stopSpeaking } from './speech'

export interface VisibilityHandlers {
  /** 見えなくなったとき（止める） */
  hide: () => void
  /** 戻ったとき（再開する） */
  show: () => void
}

export interface VisibilityController {
  /** いまの見え方を伝える（イベントのたびに呼ぶ）。変わったときだけ hide・show を呼ぶ */
  update: (visible: boolean) => void
  isHidden: () => boolean
}

/** 見え方の変化を、止める・再開するに変える（同じ向きのイベントが続いても1回だけ） */
export function createVisibilityController(handlers: VisibilityHandlers, initiallyVisible = true): VisibilityController {
  let hidden = !initiallyVisible
  return {
    update(visible) {
      if (visible === !hidden) return
      hidden = !visible
      if (hidden) handlers.hide()
      else handlers.show()
    },
    isHidden: () => hidden,
  }
}

/** 止める順：読み上げ → BGM（いまの位置で止める）→ 音の出口（効果音） */
export function hideAudio(): void {
  stopSpeaking()
  suspendBgm()
  suspendAudioEngine()
}

/** 再開する順：音の出口 → BGM（続きから）。読み上げは再開しない（プレイヤーがもう一度押す） */
export function showAudio(): void {
  resumeAudioEngine()
  resumeBgm()
}

let initialized = false

/** 起動時に1回呼ぶ */
export function initPageVisibility(): void {
  if (initialized || typeof document === 'undefined' || typeof window === 'undefined') return
  initialized = true
  const controller = createVisibilityController({ hide: hideAudio, show: showAudio }, document.visibilityState !== 'hidden')
  document.addEventListener('visibilitychange', () => controller.update(document.visibilityState !== 'hidden'))
  window.addEventListener('pagehide', () => controller.update(false))
  window.addEventListener('pageshow', () => controller.update(document.visibilityState !== 'hidden'))
}
