import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import { setBgmEnabled } from '../audio/bgm'
import { setBgmMasterVolume, setSfxVolume } from '../audio/engine'
import { setSfxEnabled } from '../audio/sfx'
import { applySavedSlowRate } from '../audio/speech'
import { content } from '../data'
import type { SaveData } from '../storage/saveData'
import { saveGame } from '../storage/saveStore'
import { saveSettings, type Settings } from '../storage/settings'
import type { BootResult } from './boot'
import { GameContext } from './GameContext'
import { createGameReducer, createInitialState } from './gameState'

const gameReducer = createGameReducer({
  events: content.events,
  balance: content.balance,
  conversations: content.conversations,
  locationIds: new Set(content.locations.map((l) => l.id)),
  firstHangulLessonId: content.hangulLessons[0]?.id ?? null,
  storyIds: new Set(content.stories.map((s) => s.id)),
})

function initState(boot: BootResult) {
  return createInitialState(boot.load, boot.backupKey, boot.settings.settings)
}

export function GameProvider({ boot, children }: { boot: BootResult; children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, boot, initState)

  // 読み込んだままのデータ（移行していないもの）は書き直さない
  const lastSaved = useRef<SaveData | null>(boot.load.kind === 'ok' && boot.load.migratedFrom === null ? boot.load.data : null)
  const lastSettings = useRef<Settings>(boot.settings.settings)

  // セーブデータが変わったら自動で保存する
  useEffect(() => {
    if (state.save === null || state.save === lastSaved.current || boot.storage === null) return
    lastSaved.current = state.save
    const result = saveGame(boot.storage, state.save)
    if (result.ok) dispatch({ type: 'saveSucceeded' })
    else dispatch({ type: 'saveFailed', message: result.detail })
  }, [state.save, boot.storage])

  // 効果音・BGM のオン・オフと音量を反映する
  useEffect(() => {
    setSfxEnabled(state.settings.soundEffects)
  }, [state.settings.soundEffects])
  useEffect(() => {
    setSfxVolume(state.settings.sfxVolume / 100)
  }, [state.settings.sfxVolume])
  useEffect(() => {
    setBgmEnabled(state.settings.bgm)
  }, [state.settings.bgm])
  useEffect(() => {
    setBgmMasterVolume(state.settings.bgmVolume / 100)
  }, [state.settings.bgmVolume])

  // この端末の「ゆっくり」の速さ（読み上げの確認で保存したもの）を読み上げに反映する（BUG-010）
  const slowRate = state.settings.slowSpeech === null ? undefined : state.settings.slowSpeech.rate
  useEffect(() => {
    applySavedSlowRate(slowRate)
  }, [slowRate])

  // 設定が変わったら保存する
  useEffect(() => {
    if (state.settings === lastSettings.current || boot.storage === null) return
    lastSettings.current = state.settings
    const result = saveSettings(boot.storage, state.settings)
    if (!result.ok) dispatch({ type: 'saveFailed', message: `設定を保存できませんでした（${result.detail}）` })
  }, [state.settings, boot.storage])

  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>
}
