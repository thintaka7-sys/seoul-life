// 画面から使う小さなフック。

import { useCallback, useSyncExternalStore } from 'react'
import { getRecognitionStatus, subscribeRecognition, type RecognitionStatus } from '../audio/recognition'
import { getSlowState, getSpeechStatus, speakKorean, subscribeSlow, subscribeSpeech, type SpeechStatus } from '../audio/speech'
import type { SlowState } from '../audio/speechPlayer'
import { content } from '../data'
import { furiganaDisplay, type FuriganaDisplay } from '../learning/furigana/furigana'
import type { SpeechRate } from '../storage/settings'
import { useGame } from './GameContext'

export function useSpeechStatus(): SpeechStatus {
  return useSyncExternalStore(subscribeSpeech, getSpeechStatus, getSpeechStatus)
}

/** 音声認識（話して答える）が使えるか。使えない環境・マイクを拒否されたときは unavailable */
export function useRecognitionStatus(): RecognitionStatus {
  return useSyncExternalStore(subscribeRecognition, getRecognitionStatus, getRecognitionStatus)
}

/** 「話す」を出してよいか：音声認識が使え、設定で音声入力がオン */
export function useCanSpeak(): boolean {
  const { state } = useGame()
  return useRecognitionStatus().state === 'available' && state.settings.voiceInput
}

/** 設定の速さで韓国語を読み上げる関数。rate を渡せば、その速さで読む（「ゆっくり」のボタン） */
export function useSpeak(): (text: string, rate?: SpeechRate) => void {
  const { state } = useGame()
  const setting = state.settings.speechRate
  return useCallback((text: string, rate?: SpeechRate) => speakKorean(text, rate ?? setting), [setting])
}

/**
 * 「ゆっくり」のボタンで読み上げる関数。速さが変わらない端末では、間を空けて2回くり返して読む（BUG-010。GAME_SPEC 10-4）
 */
export function useSpeakSlow(): (text: string) => void {
  return useCallback((text: string) => speakKorean(text, 'slow', { slowButton: true }), [])
}

/** 「ゆっくり」が効くか（ゲームを開いている間の判断）と、「2回くり返します」の知らせを出すか */
export function useSlowState(): SlowState {
  return useSyncExternalStore(subscribeSlow, getSlowState, getSlowState)
}

/** その章の文のフリガナの出し方（設定と章から決める） */
export function useFuriganaDisplay(chapter: number): FuriganaDisplay {
  const { state } = useGame()
  return furiganaDisplay(state.settings.furigana, chapter, content.balance.furiganaAlwaysUntilChapter)
}
