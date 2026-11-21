// 韓国語の読み上げ（ブラウザの読み上げ機能、ko-KR）。
// 韓国語の音声がない環境では「使えない」とし、画面はボタンを無効にして理由を表示する。
// 音声の一覧は、ブラウザによっては後から（voiceschanged で）届くため、少し待ってから判断する。

import type { SpeechRate } from '../storage/settings'
import { createSpeechPlayer, type SlowState, type SpeakOptions, type SpeechPlayer } from './speechPlayer'

export type SpeechStatus =
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'unavailable'; reason: string }

interface VoiceLike {
  lang: string
  name: string
  localService?: boolean
}

/** 韓国語の音声を選ぶ。ko-KR を優先し、端末内の音声（通信が不要）を優先する */
export function pickKoreanVoice<V extends VoiceLike>(voices: readonly V[]): V | null {
  const lang = (v: V) => v.lang.replace('_', '-').toLowerCase()
  const korean = voices.filter((v) => lang(v).startsWith('ko'))
  const score = (v: V) => (lang(v) === 'ko-kr' ? 2 : 0) + (v.localService === true ? 1 : 0)
  return [...korean].sort((a, b) => score(b) - score(a))[0] ?? null
}

/** 読み上げの速さ。ゆっくりは 0.5（0.7 では差が分かりにくい端末があったため。BUG-010） */
export function speechRateValue(rate: SpeechRate): number {
  return rate === 'slow' ? 0.5 : 1
}

/** 音声の一覧が届くのを待つ時間 */
const VOICE_WAIT_MS = 2000

let status: SpeechStatus = { state: 'checking' }
let player: SpeechPlayer | null = null
const listeners = new Set<() => void>()

function setStatus(next: SpeechStatus) {
  status = next
  for (const l of listeners) l()
}

export function getSpeechStatus(): SpeechStatus {
  return status
}

export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let initialized = false

/** 起動時に1回呼ぶ。韓国語の音声があるかを調べる */
export function initSpeech(): void {
  if (initialized) return
  initialized = true
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    setStatus({ state: 'unavailable', reason: 'このブラウザは読み上げに対応していません' })
    return
  }
  const synth = window.speechSynthesis
  const check = (): boolean => {
    const voice = pickKoreanVoice(synth.getVoices())
    if (voice === null) return false
    player = createSpeechPlayer(
      {
        cancel: () => synth.cancel(),
        speak: (u) => {
          if (u instanceof SpeechSynthesisUtterance) synth.speak(u)
        },
        utterance: (text) => {
          const u = new SpeechSynthesisUtterance(text)
          u.lang = voice.lang
          u.voice = voice
          return u
        },
        now: () => performance.now(),
        later: (fn, ms) => window.setTimeout(fn, ms),
      },
      speechRateValue,
    )
    player.subscribe(() => {
      for (const l of slowListeners) l()
    })
    setStatus({ state: 'available' })
    return true
  }
  if (check()) return
  const onChange = () => {
    if (check()) synth.removeEventListener('voiceschanged', onChange)
  }
  synth.addEventListener('voiceschanged', onChange)
  window.setTimeout(() => {
    if (status.state === 'checking') {
      synth.removeEventListener('voiceschanged', onChange)
      setStatus({ state: 'unavailable', reason: 'この端末には韓国語の音声がありません（端末の設定で韓国語の音声を追加すると使えます）' })
    }
  }, VOICE_WAIT_MS)
}

/** 韓国語を読み上げる。読み上げ中のものは止めてから読む。使えない環境では何もしない */
export function speakKorean(text: string, rate: SpeechRate, options: SpeakOptions = {}): void {
  if (status.state !== 'available' || player === null) return
  void player.speak(text, rate, options)
}

/** 読み上げの確認（設定画面）：同じ文をふつう → ゆっくりで読み、長さ（ミリ秒）と、速さが効くかを返す */
export async function measureSpeech(text: string): Promise<{ normal: number | null; slow: number | null; support: SlowState['support'] } | null> {
  if (status.state !== 'available' || player === null) return null
  return player.measure(text)
}

const NO_SLOW_STATE: SlowState = { support: 'unknown', noticePending: false }
const slowListeners = new Set<() => void>()

/** 「ゆっくり」が効くか（ゲームを開いている間の判断） */
export function getSlowState(): SlowState {
  return player?.getState() ?? NO_SLOW_STATE
}

export function subscribeSlow(listener: () => void): () => void {
  slowListeners.add(listener)
  return () => slowListeners.delete(listener)
}

/** 「2回くり返して読みます」を知らせた */
export function clearSlowNotice(): void {
  player?.clearNotice()
}
