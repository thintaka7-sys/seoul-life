// 設定。セーブデータとは別のキーに保存する（セーブデータがなくても設定でき、「はじめから」でも消えないように）。
// 形式を変えるときは、セーブデータと同じく version を上げて移行処理を書く。

import { writeItem, type KeyValueStorage, type SaveResult } from './saveStore'

export const SETTINGS_KEY = 'seoul-life:settings'
export const CURRENT_SETTINGS_VERSION = 1

/** フリガナ：おすすめ（序盤はいつも表示・それ以降はタップ）／いつも表示／タップで表示／表示しない */
export const FURIGANA_MODES = ['recommended', 'always', 'tap', 'off'] as const
export type FuriganaMode = (typeof FURIGANA_MODES)[number]

export const SPEECH_RATES = ['slow', 'normal'] as const
export type SpeechRate = (typeof SPEECH_RATES)[number]

export interface Settings {
  version: 1
  furigana: FuriganaMode
  speechRate: SpeechRate
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  furigana: 'recommended',
  speechRate: 'normal',
}

export type SettingsLoadResult =
  | { kind: 'ok'; settings: Settings }
  /** 保存されていない、または保存先が使えない */
  | { kind: 'default'; settings: Settings }
  /** 読めなかった・一部の値が正しくなかった（読める項目は使い、ほかは初期値にする） */
  | { kind: 'repaired'; settings: Settings; detail: string }

function pick<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.find((a) => a === v) ?? fallback
}

/** 設定を読み込む。壊れていても例外を投げず、読める項目だけを使う */
export function loadSettings(storage: KeyValueStorage | null): SettingsLoadResult {
  if (storage === null) return { kind: 'default', settings: DEFAULT_SETTINGS }
  let raw: string | null
  try {
    raw = storage.getItem(SETTINGS_KEY)
  } catch {
    return { kind: 'default', settings: DEFAULT_SETTINGS }
  }
  if (raw === null) return { kind: 'default', settings: DEFAULT_SETTINGS }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'repaired', settings: DEFAULT_SETTINGS, detail: 'JSONとして読めないため初期値にしました' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'repaired', settings: DEFAULT_SETTINGS, detail: '設定の形ではないため初期値にしました' }
  }
  const obj = parsed as Record<string, unknown>
  if (obj['version'] !== CURRENT_SETTINGS_VERSION) {
    return { kind: 'repaired', settings: DEFAULT_SETTINGS, detail: `対応していないバージョン（${String(obj['version'])}）のため初期値にしました` }
  }
  const settings: Settings = {
    version: 1,
    furigana: pick(FURIGANA_MODES, obj['furigana'], DEFAULT_SETTINGS.furigana),
    speechRate: pick(SPEECH_RATES, obj['speechRate'], DEFAULT_SETTINGS.speechRate),
  }
  const repaired = settings.furigana !== obj['furigana'] || settings.speechRate !== obj['speechRate']
  return repaired ? { kind: 'repaired', settings, detail: '正しくない値を初期値に戻しました' } : { kind: 'ok', settings }
}

export function saveSettings(storage: KeyValueStorage | null, settings: Settings): SaveResult {
  return writeItem(storage, SETTINGS_KEY, JSON.stringify(settings))
}
