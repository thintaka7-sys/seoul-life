// 韓国語の読み上げ（ブラウザの読み上げ機能、ko-KR）。
// 韓国語の音声がない環境では「使えない」とし、画面はボタンを無効にして理由を表示する。
// 音声の一覧は、ブラウザによっては後から（voiceschanged で）届くため、少し待ってから判断する。

import type { SpeechRate } from '../storage/settings'
import { holdAudioForSpeech } from './audioSession'
import { INITIAL_SLOW_STATE, createSpeechPlayer, type SlowState, type SpeakOptions, type SpeechCheckResult, type SpeechPlayer } from './speechPlayer'

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

/**
 * 読み上げの速さ（まだ「読み上げの確認」をしていない端末での値）。ゆっくりは 0.5（0.7 では差が分かりにくい端末があったため。BUG-010）。
 * 確かめた端末では、その端末で十分に遅くなる速さを使う（speechPlayer の SlowState.rate）
 */
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
    player = createSpeechPlayer({
      cancel: () => synth.cancel(),
      speak: (u) => {
        const s = new SpeechSynthesisUtterance(u.text)
        s.lang = voice.lang
        s.voice = voice
        s.rate = u.rate
        s.onstart = () => u.onstart?.()
        // 端末が知らせる「話していた時間」（elapsedTime）も渡す（読み始めまでの待ち時間を含まない長さのため）
        s.onend = (e) => u.onend?.({ elapsedTime: e?.elapsedTime })
        s.onerror = () => u.onerror?.()
        synth.speak(s)
      },
      now: () => performance.now(),
      later: (fn, ms) => window.setTimeout(fn, ms),
    })
    player.applySaved(savedSlowRate)
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
  // 読み上げはプレイヤーがボタンを押して始めるので、マナーモードでも鳴る扱いにする（終わったら戻す）
  const release = holdAudioForSpeech()
  void player.speak(text, rate, options).finally(release)
}

/** 読み上げの確認（設定画面）：同じ文をふつう → 遅い速さの候補で読み、長さと選んだ速さを返す */
export async function checkSpeech(text: string): Promise<SpeechCheckResult | null> {
  if (status.state !== 'available' || player === null) return null
  const release = holdAudioForSpeech()
  try {
    return await player.check(text)
  } finally {
    release()
  }
}

/** 設定に保存してある、この端末の「ゆっくり」の速さ（null は2回くり返す。undefined はまだ確かめていない） */
let savedSlowRate: number | null | undefined = undefined

/** 保存してある「ゆっくり」の速さを使う（設定を読み込んだとき・変わったとき） */
export function applySavedSlowRate(rate: number | null | undefined): void {
  savedSlowRate = rate
  player?.applySaved(rate)
}

const slowListeners = new Set<() => void>()

/** 「ゆっくり」が効くか（ゲームを開いている間の判断） */
export function getSlowState(): SlowState {
  return player?.getState() ?? INITIAL_SLOW_STATE
}

export function subscribeSlow(listener: () => void): () => void {
  slowListeners.add(listener)
  return () => slowListeners.delete(listener)
}

/** 自動の判断の知らせを出した */
export function clearSlowNotice(): void {
  player?.clearNotice()
}
