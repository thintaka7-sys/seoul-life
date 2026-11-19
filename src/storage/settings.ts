// 設定。セーブデータとは別のキーに保存する（セーブデータがなくても設定でき、「はじめから」でも消えないように）。
// 形式を変えるときは、セーブデータと同じく version を上げて移行処理を書く。

import { writeItem, type KeyValueStorage, type SaveResult } from './saveStore'

export const SETTINGS_KEY = 'seoul-life:settings'
export const CURRENT_SETTINGS_VERSION = 2

/** フリガナ：おすすめ（序盤はいつも表示・それ以降はタップ）／いつも表示／タップで表示／表示しない */
export const FURIGANA_MODES = ['recommended', 'always', 'tap', 'off'] as const
export type FuriganaMode = (typeof FURIGANA_MODES)[number]

export const SPEECH_RATES = ['slow', 'normal'] as const
export type SpeechRate = (typeof SPEECH_RATES)[number]

/** 文字送り：なし（すぐ全文）／速い／ふつう／ゆっくり */
export const TEXT_SPEEDS = ['instant', 'fast', 'normal', 'slow'] as const
export type TextSpeed = (typeof TEXT_SPEEDS)[number]

/** 演出：ふつう／控えめ（動きはフェードだけ、数字はすぐ結果を出す） */
export const EFFECT_LEVELS = ['normal', 'reduced'] as const
export type EffectLevel = (typeof EFFECT_LEVELS)[number]

/** v1（Phase 1）。移行のために型を残しておく */
export interface SettingsV1 {
  version: 1
  furigana: FuriganaMode
  speechRate: SpeechRate
}

/** v2（Phase 1.5） */
export interface Settings {
  version: 2
  furigana: FuriganaMode
  speechRate: SpeechRate
  textSpeed: TextSpeed
  /** 効果音を鳴らすか */
  soundEffects: boolean
  effects: EffectLevel
}

/**
 * 初期値。演出は、端末で「動きを減らす」設定がオンなら「控えめ」にする。
 * prefersReducedMotion は呼び出し側で調べて渡す（ここではブラウザの機能を使わない）。
 */
export function defaultSettings(prefersReducedMotion: boolean): Settings {
  return {
    version: 2,
    furigana: 'recommended',
    speechRate: 'normal',
    textSpeed: 'normal',
    soundEffects: true,
    effects: prefersReducedMotion ? 'reduced' : 'normal',
  }
}

/** 「動きを減らす」がオフの端末での初期値 */
export const DEFAULT_SETTINGS: Settings = defaultSettings(false)

export type SettingsLoadResult =
  | { kind: 'ok'; settings: Settings }
  /** 保存されていない、または保存先が使えない */
  | { kind: 'default'; settings: Settings }
  /** 読めなかった・一部の値が正しくなかった（読める項目は使い、ほかは初期値にする） */
  | { kind: 'repaired'; settings: Settings; detail: string }

function pick<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.find((a) => a === v) ?? fallback
}

export interface LoadSettingsOptions {
  /** 端末で「動きを減らす」設定がオンか（初期値の決定に使う） */
  prefersReducedMotion?: boolean
}

/**
 * 設定を読み込む。壊れていても例外を投げず、読める項目だけを使う。
 * v1 は v2 に移す（増えた項目は初期値）。
 */
export function loadSettings(storage: KeyValueStorage | null, options: LoadSettingsOptions = {}): SettingsLoadResult {
  const defaults = defaultSettings(options.prefersReducedMotion ?? false)
  if (storage === null) return { kind: 'default', settings: defaults }
  let raw: string | null
  try {
    raw = storage.getItem(SETTINGS_KEY)
  } catch {
    return { kind: 'default', settings: defaults }
  }
  if (raw === null) return { kind: 'default', settings: defaults }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'repaired', settings: defaults, detail: 'JSONとして読めないため初期値にしました' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'repaired', settings: defaults, detail: '設定の形ではないため初期値にしました' }
  }
  const obj = parsed as Record<string, unknown>
  const version = obj['version']
  if (version !== 1 && version !== CURRENT_SETTINGS_VERSION) {
    return { kind: 'repaired', settings: defaults, detail: `対応していないバージョン（${String(version)}）のため初期値にしました` }
  }
  // v1 → v2：v1 にない項目は初期値を入れる（正しくない値とはみなさない）
  const source: Record<string, unknown> = version === 1 ? { ...obj, textSpeed: defaults.textSpeed, soundEffects: defaults.soundEffects, effects: defaults.effects } : obj
  const settings: Settings = {
    version: 2,
    furigana: pick(FURIGANA_MODES, source['furigana'], defaults.furigana),
    speechRate: pick(SPEECH_RATES, source['speechRate'], defaults.speechRate),
    textSpeed: pick(TEXT_SPEEDS, source['textSpeed'], defaults.textSpeed),
    soundEffects: typeof source['soundEffects'] === 'boolean' ? source['soundEffects'] : defaults.soundEffects,
    effects: pick(EFFECT_LEVELS, source['effects'], defaults.effects),
  }
  const repaired =
    settings.furigana !== source['furigana'] ||
    settings.speechRate !== source['speechRate'] ||
    settings.textSpeed !== source['textSpeed'] ||
    settings.soundEffects !== source['soundEffects'] ||
    settings.effects !== source['effects']
  return repaired ? { kind: 'repaired', settings, detail: '正しくない値を初期値に戻しました' } : { kind: 'ok', settings }
}

export function saveSettings(storage: KeyValueStorage | null, settings: Settings): SaveResult {
  return writeItem(storage, SETTINGS_KEY, JSON.stringify(settings))
}
