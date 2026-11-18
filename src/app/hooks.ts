// 画面から使う小さなフック。

import { useCallback, useSyncExternalStore } from 'react'
import { getSpeechStatus, speakKorean, subscribeSpeech, type SpeechStatus } from '../audio/speech'
import { content } from '../data'
import { furiganaDisplay, type FuriganaDisplay } from '../learning/furigana/furigana'
import { useGame } from './GameContext'

export function useSpeechStatus(): SpeechStatus {
  return useSyncExternalStore(subscribeSpeech, getSpeechStatus, getSpeechStatus)
}

/** 設定の速さで韓国語を読み上げる関数 */
export function useSpeak(): (text: string) => void {
  const { state } = useGame()
  const rate = state.settings.speechRate
  return useCallback((text: string) => speakKorean(text, rate), [rate])
}

/** その章の文のフリガナの出し方（設定と章から決める） */
export function useFuriganaDisplay(chapter: number): FuriganaDisplay {
  const { state } = useGame()
  return furiganaDisplay(state.settings.furigana, chapter, content.balance.furiganaAlwaysUntilChapter)
}
