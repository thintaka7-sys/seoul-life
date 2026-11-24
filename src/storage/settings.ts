// 設定。セーブデータとは別のキーに保存する（セーブデータがなくても設定でき、「はじめから」でも消えないように）。
// 形式を変えるときは、セーブデータと同じく version を上げて移行処理を書く。

import { writeItem, type KeyValueStorage, type SaveResult } from './saveStore'

export const SETTINGS_KEY = 'seoul-life:settings'
export const CURRENT_SETTINGS_VERSION = 6

/** フリガナ：おすすめ（序盤はいつも表示・それ以降はタップ）／いつも表示／タップで表示／表示しない */
export const FURIGANA_MODES = ['recommended', 'always', 'tap', 'off'] as const
export type FuriganaMode = (typeof FURIGANA_MODES)[number]

/** 日本語訳：いつも表示／タップで表示／表示しない（GAME_SPEC 9-3。フリガナとは別） */
export const TRANSLATION_MODES = ['always', 'tap', 'off'] as const
export type TranslationMode = (typeof TRANSLATION_MODES)[number]

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

/** v2（Phase 1.5）。移行のために型を残しておく */
export interface SettingsV2 {
  version: 2
  furigana: FuriganaMode
  speechRate: SpeechRate
  textSpeed: TextSpeed
  soundEffects: boolean
  effects: EffectLevel
}

/**
 * この端末の「ゆっくり」の読み上げ（BUG-010。GAME_SPEC 10-4）。設定の「読み上げの確認」で決める。
 * 端末ごとの値なので、設定の書き出し（Phase 4）には含めない
 */
export interface SlowSpeech {
  /** 「ゆっくり」で使う速さ（0〜1）。null なら、どの速さでも十分に遅くならない端末（2回くり返して読む） */
  rate: number | null
  /** 確かめた日時（ISO 8601） */
  measuredAt: string
}

/** v3（Phase 2）。移行のために型を残しておく */
export interface SettingsV3 {
  version: 3
  furigana: FuriganaMode
  translation: TranslationMode
  speechRate: SpeechRate
  textSpeed: TextSpeed
  soundEffects: boolean
  effects: EffectLevel
  voiceInput: boolean
  voiceInputNoticeSeen: boolean
}

/** v4（Phase 2.6。slowSpeech を追加）。移行のために型を残しておく */
export interface SettingsV4 extends Omit<Settings, 'version' | 'bgm' | 'bgmVolume' | 'sfxVolume'> {
  version: 4
}

/** 音量の範囲（0〜100） */
export const VOLUME_MAX = 100

/** v5（Phase 3。BGM のオン・オフと音量、効果音の音量を追加）。移行のために型を残しておく */
export interface SettingsV5 extends Omit<Settings, 'version' | 'quietAfterVoiceInput'> {
  version: 5
}

/** v6（Phase 3。話して答えたあと BGM・効果音を止める設定を追加） */
export interface Settings {
  version: 6
  furigana: FuriganaMode
  /** 日本語訳の出し方（台詞・反応・ログ・単語カードの例文・コラムの韓国語） */
  translation: TranslationMode
  speechRate: SpeechRate
  textSpeed: TextSpeed
  /** 効果音を鳴らすか */
  soundEffects: boolean
  effects: EffectLevel
  /** 音声入力（話して答える）を使うか。使えない環境では、オンでもマイクを出さない */
  voiceInput: boolean
  /** 音声入力の説明（音声が外部で処理されることがある）を見たか */
  voiceInputNoticeSeen: boolean
  /** この端末の「ゆっくり」の読み上げ。まだ確かめていなければ null */
  slowSpeech: SlowSpeech | null
  /** BGM を流すか */
  bgm: boolean
  /** BGM の音量（0〜100） */
  bgmVolume: number
  /** 効果音の音量（0〜100。オン・オフは soundEffects） */
  sfxVolume: number
  /**
   * 話して答えたあと、ページを開き直すまで BGM・効果音を止めるか（iPhone はマイクを使うとマナーモードが効かなくなることがあるため）。
   * 初期値は、マナーモードを区別できるブラウザ（navigator.audioSession がある。iPhone の Safari など）ではオン
   */
  quietAfterVoiceInput: boolean
}

export interface DefaultSettingsOptions {
  /** 端末で「動きを減らす」設定がオンか */
  prefersReducedMotion?: boolean
  /** ブラウザに navigator.audioSession があるか（iPhone の Safari など） */
  hasAudioSession?: boolean
}

/**
 * 初期値。演出は、端末で「動きを減らす」設定がオンなら「控えめ」にする。
 * 話して答えたあと BGM・効果音を止めるのは、navigator.audioSession がある端末（iPhone の Safari など）ではオン。
 * 端末のことは呼び出し側で調べて渡す（ここではブラウザの機能を使わない）。
 */
export function defaultSettings(options: DefaultSettingsOptions = {}): Settings {
  const { prefersReducedMotion = false, hasAudioSession = false } = options
  return {
    version: 6,
    furigana: 'recommended',
    translation: 'always',
    speechRate: 'normal',
    textSpeed: 'normal',
    soundEffects: true,
    effects: prefersReducedMotion ? 'reduced' : 'normal',
    voiceInput: true,
    voiceInputNoticeSeen: false,
    slowSpeech: null,
    bgm: true,
    bgmVolume: 60,
    sfxVolume: 80,
    quietAfterVoiceInput: hasAudioSession,
  }
}

/** 「動きを減らす」がオフで、audioSession がない端末での初期値 */
export const DEFAULT_SETTINGS: Settings = defaultSettings()

export type SettingsLoadResult =
  | { kind: 'ok'; settings: Settings }
  /** 保存されていない、または保存先が使えない */
  | { kind: 'default'; settings: Settings }
  /** 読めなかった・一部の値が正しくなかった（読める項目は使い、ほかは初期値にする） */
  | { kind: 'repaired'; settings: Settings; detail: string }

function isSlowSpeech(v: unknown): v is SlowSpeech {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  const rate = o['rate']
  const rateOk = rate === null || (typeof rate === 'number' && rate > 0 && rate <= 1)
  return rateOk && typeof o['measuredAt'] === 'string'
}

function pick<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.find((a) => a === v) ?? fallback
}

/** 初期値の決定に使う、端末のこと */
export type LoadSettingsOptions = DefaultSettingsOptions

/**
 * 設定を読み込む。壊れていても例外を投げず、読める項目だけを使う。
 * v1〜v5 は v6 に移す（増えた項目は初期値）。
 */
export function loadSettings(storage: KeyValueStorage | null, options: LoadSettingsOptions = {}): SettingsLoadResult {
  const defaults = defaultSettings(options)
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
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== CURRENT_SETTINGS_VERSION) {
    return { kind: 'repaired', settings: defaults, detail: `対応していないバージョン（${String(version)}）のため初期値にしました` }
  }
  // 古い版にない項目は初期値を入れる（正しくない値とはみなさない）
  // v1 → v2：textSpeed・soundEffects・effects。v2 → v3：translation・voiceInput・voiceInputNoticeSeen。v3 → v4：slowSpeech。v4 → v5：bgm・bgmVolume・sfxVolume
  // v5 → v6：quietAfterVoiceInput（端末に合わせた初期値。iPhone の Safari などではオン）
  const added: Record<string, unknown> = {}
  if (version === 1) Object.assign(added, { textSpeed: defaults.textSpeed, soundEffects: defaults.soundEffects, effects: defaults.effects })
  if (version === 1 || version === 2) {
    Object.assign(added, { translation: defaults.translation, voiceInput: defaults.voiceInput, voiceInputNoticeSeen: defaults.voiceInputNoticeSeen })
  }
  if (version === 1 || version === 2 || version === 3) Object.assign(added, { slowSpeech: null })
  if (version === 1 || version === 2 || version === 3 || version === 4) Object.assign(added, { bgm: defaults.bgm, bgmVolume: defaults.bgmVolume, sfxVolume: defaults.sfxVolume })
  if (version !== CURRENT_SETTINGS_VERSION) Object.assign(added, { quietAfterVoiceInput: defaults.quietAfterVoiceInput })
  const source: Record<string, unknown> = { ...obj, ...added }
  const bool = (key: 'soundEffects' | 'voiceInput' | 'voiceInputNoticeSeen' | 'bgm' | 'quietAfterVoiceInput'): boolean => {
    const v = source[key]
    return typeof v === 'boolean' ? v : defaults[key]
  }
  const volume = (key: 'bgmVolume' | 'sfxVolume'): number => {
    const v = source[key]
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= VOLUME_MAX ? v : defaults[key]
  }
  const rawSlow = source['slowSpeech']
  const slowSpeech = rawSlow === null || !isSlowSpeech(rawSlow) ? null : { rate: rawSlow.rate, measuredAt: rawSlow.measuredAt }
  const settings: Settings = {
    version: 6,
    furigana: pick(FURIGANA_MODES, source['furigana'], defaults.furigana),
    translation: pick(TRANSLATION_MODES, source['translation'], defaults.translation),
    speechRate: pick(SPEECH_RATES, source['speechRate'], defaults.speechRate),
    textSpeed: pick(TEXT_SPEEDS, source['textSpeed'], defaults.textSpeed),
    soundEffects: bool('soundEffects'),
    effects: pick(EFFECT_LEVELS, source['effects'], defaults.effects),
    voiceInput: bool('voiceInput'),
    voiceInputNoticeSeen: bool('voiceInputNoticeSeen'),
    slowSpeech,
    bgm: bool('bgm'),
    bgmVolume: volume('bgmVolume'),
    sfxVolume: volume('sfxVolume'),
    quietAfterVoiceInput: bool('quietAfterVoiceInput'),
  }
  const slowRepaired = rawSlow !== null && slowSpeech === null
  const keys = ['furigana', 'translation', 'speechRate', 'textSpeed', 'soundEffects', 'effects', 'voiceInput', 'voiceInputNoticeSeen', 'bgm', 'bgmVolume', 'sfxVolume', 'quietAfterVoiceInput'] as const
  const repaired = slowRepaired || keys.some((k) => settings[k] !== source[k])
  return repaired ? { kind: 'repaired', settings, detail: '正しくない値を初期値に戻しました' } : { kind: 'ok', settings }
}

export function saveSettings(storage: KeyValueStorage | null, settings: Settings): SaveResult {
  return writeItem(storage, SETTINGS_KEY, JSON.stringify(settings))
}
