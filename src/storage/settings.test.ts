import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_KEY, defaultSettings, loadSettings, saveSettings, type Settings, type SettingsV5 } from './settings'
import { MemoryStorage, quotaError } from './testing'

describe('設定の保存と読み込み', () => {
  it('保存されていなければ初期値（フリガナはおすすめ、訳はいつも表示、読み上げ・文字送りはふつう、効果音はオン、演出はふつう、音声入力はオンで説明は未読）', () => {
    expect(loadSettings(new MemoryStorage())).toEqual({ kind: 'default', settings: DEFAULT_SETTINGS })
    expect(DEFAULT_SETTINGS).toEqual({
      version: 6,
      furigana: 'recommended',
      translation: 'always',
      speechRate: 'normal',
      textSpeed: 'normal',
      soundEffects: true,
      effects: 'normal',
      voiceInput: true,
      voiceInputNoticeSeen: false,
      slowSpeech: null,
      bgm: true,
      bgmVolume: 60,
      sfxVolume: 80,
      quietAfterVoiceInput: false,
    })
  })

  it('iPhone の Safari など（audioSession がある端末）では、「話して答えたあと、BGM・効果音を止める」の初期値はオン', () => {
    expect(defaultSettings({ hasAudioSession: true })).toEqual({ ...DEFAULT_SETTINGS, quietAfterVoiceInput: true })
    expect(loadSettings(new MemoryStorage(), { hasAudioSession: true }).settings.quietAfterVoiceInput).toBe(true)
    expect(loadSettings(null, { hasAudioSession: true }).settings.quietAfterVoiceInput).toBe(true)
  })

  it('端末で「動きを減らす」がオンなら、演出の初期値は控えめ', () => {
    expect(loadSettings(new MemoryStorage(), { prefersReducedMotion: true }).settings.effects).toBe('reduced')
    expect(loadSettings(null, { prefersReducedMotion: true }).settings.effects).toBe('reduced')
    expect(defaultSettings({ prefersReducedMotion: true })).toEqual({ ...DEFAULT_SETTINGS, effects: 'reduced' })
  })

  it('v1 の設定は、フリガナと読み上げを引き継いで v6 にする（増えた項目は初期値）', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, furigana: 'tap', speechRate: 'slow' }))
    expect(loadSettings(storage)).toEqual({ kind: 'ok', settings: { ...DEFAULT_SETTINGS, furigana: 'tap', speechRate: 'slow' } })
    expect(loadSettings(storage, { prefersReducedMotion: true }).settings.effects).toBe('reduced')
  })

  it('v1 の正しくない値は初期値に戻す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, furigana: 'sometimes', speechRate: 'slow' }))
    expect(loadSettings(storage)).toMatchObject({ kind: 'repaired', settings: { furigana: 'recommended', speechRate: 'slow', textSpeed: 'normal' } })
  })

  it('v2 の設定は、すべての項目を引き継いで v6 にする（訳・音声入力・ゆっくりの読み上げは初期値）', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 2, furigana: 'off', speechRate: 'slow', textSpeed: 'fast', soundEffects: false, effects: 'reduced' }))
    expect(loadSettings(storage)).toEqual({
      kind: 'ok',
      settings: { ...DEFAULT_SETTINGS, furigana: 'off', speechRate: 'slow', textSpeed: 'fast', soundEffects: false, effects: 'reduced' },
    })
  })

  it('v3 の設定は、すべての項目を引き継いで v6 にする（ゆっくりの読み上げは、まだ確かめていない）', () => {
    const storage = new MemoryStorage()
    const { slowSpeech: _omit, ...v3 } = { ...DEFAULT_SETTINGS, version: 3, furigana: 'off', translation: 'tap', voiceInputNoticeSeen: true }
    storage.setItem(SETTINGS_KEY, JSON.stringify(v3))
    expect(loadSettings(storage)).toEqual({ kind: 'ok', settings: { ...DEFAULT_SETTINGS, furigana: 'off', translation: 'tap', voiceInputNoticeSeen: true } })
  })

  it('v4 の設定は、すべての項目を引き継いで v6 にする（BGM はオン、音量は初期値）', () => {
    const storage = new MemoryStorage()
    const { bgm: _b, bgmVolume: _v, sfxVolume: _s, quietAfterVoiceInput: _q, ...v4 } = { ...DEFAULT_SETTINGS, version: 4, soundEffects: false, slowSpeech: { rate: 0.35, measuredAt: '2026-11-22T10:00:00.000Z' } }
    storage.setItem(SETTINGS_KEY, JSON.stringify(v4))
    expect(loadSettings(storage)).toEqual({ kind: 'ok', settings: { ...DEFAULT_SETTINGS, soundEffects: false, slowSpeech: v4.slowSpeech } })
  })

  it('v5 の設定は、すべての項目を引き継いで v6 にする（話して答えたあと止めるかは、端末に合わせた初期値）', () => {
    const storage = new MemoryStorage()
    const { quietAfterVoiceInput: _q, ...rest } = { ...DEFAULT_SETTINGS, bgm: false, bgmVolume: 30, voiceInputNoticeSeen: true }
    const v5: SettingsV5 = { ...rest, version: 5 }
    storage.setItem(SETTINGS_KEY, JSON.stringify(v5))
    const expected = { ...DEFAULT_SETTINGS, bgm: false, bgmVolume: 30, voiceInputNoticeSeen: true }
    // iPhone の Safari など：オン。ほかの端末：オフ
    expect(loadSettings(storage, { hasAudioSession: true })).toEqual({ kind: 'ok', settings: { ...expected, quietAfterVoiceInput: true } })
    expect(loadSettings(storage)).toEqual({ kind: 'ok', settings: { ...expected, quietAfterVoiceInput: false } })
  })

  it('v6 で保存した「話して答えたあと止める」は、端末にかかわらずそのまま使う。正しくない値は初期値に戻す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, quietAfterVoiceInput: false }))
    expect(loadSettings(storage, { hasAudioSession: true })).toEqual({ kind: 'ok', settings: { ...DEFAULT_SETTINGS, quietAfterVoiceInput: false } })
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, quietAfterVoiceInput: 'yes' }))
    expect(loadSettings(storage, { hasAudioSession: true })).toMatchObject({ kind: 'repaired', settings: { quietAfterVoiceInput: true } })
  })

  it('BGM・音量の正しくない値は初期値に戻す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, bgm: 'on', bgmVolume: 150, sfxVolume: 12.5 }))
    expect(loadSettings(storage)).toMatchObject({ kind: 'repaired', settings: { bgm: true, bgmVolume: 60, sfxVolume: 80 } })
  })

  it('ゆっくりの読み上げ（slowSpeech）を読み込む。正しくない値は「まだ確かめていない」に戻す', () => {
    const storage = new MemoryStorage()
    for (const slowSpeech of [{ rate: 0.35, measuredAt: '2026-11-22T10:00:00.000Z' }, { rate: null, measuredAt: '2026-11-22T10:00:00.000Z' }]) {
      storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, slowSpeech }))
      expect(loadSettings(storage)).toEqual({ kind: 'ok', settings: { ...DEFAULT_SETTINGS, slowSpeech } })
    }
    for (const slowSpeech of [{ rate: 2, measuredAt: 'x' }, { rate: 0.5 }, 'fast', { rate: 0, measuredAt: 'x' }]) {
      storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, slowSpeech }))
      expect(loadSettings(storage)).toMatchObject({ kind: 'repaired', settings: { slowSpeech: null } })
    }
  })

  it('v4 の正しくない訳・音声入力の値は初期値に戻す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, translation: 'sometimes', voiceInput: 'no', voiceInputNoticeSeen: true }))
    expect(loadSettings(storage)).toMatchObject({ kind: 'repaired', settings: { translation: 'always', voiceInput: true, voiceInputNoticeSeen: true } })
  })

  it('保存した設定を読み込める', () => {
    const storage = new MemoryStorage()
    const settings: Settings = {
      version: 6,
      furigana: 'tap',
      translation: 'off',
      speechRate: 'slow',
      textSpeed: 'instant',
      soundEffects: false,
      effects: 'reduced',
      voiceInput: false,
      voiceInputNoticeSeen: true,
      slowSpeech: { rate: 0.35, measuredAt: '2026-11-22T10:00:00.000Z' },
      bgm: false,
      bgmVolume: 25,
      sfxVolume: 0,
      quietAfterVoiceInput: true,
    }
    expect(saveSettings(storage, settings)).toEqual({ ok: true })
    expect(loadSettings(storage)).toEqual({ kind: 'ok', settings })
  })

  it('保存先が使えなければ初期値', () => {
    expect(loadSettings(null).settings).toEqual(DEFAULT_SETTINGS)
    const blocked = new MemoryStorage()
    blocked.failOnGet = new Error('SecurityError')
    expect(loadSettings(blocked).settings).toEqual(DEFAULT_SETTINGS)
  })

  it('壊れていても止まらず初期値にする', () => {
    for (const raw of ['{broken', '[1]', 'null', '{"version":99,"furigana":"off"}']) {
      const storage = new MemoryStorage()
      storage.setItem(SETTINGS_KEY, raw)
      const result = loadSettings(storage)
      expect(result.kind, raw).toBe('repaired')
      expect(result.settings, raw).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('正しくない値の項目だけを初期値に戻し、ほかは残す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, furigana: 'sometimes', speechRate: 'slow', soundEffects: 'yes', textSpeed: 'fast' }))
    expect(loadSettings(storage)).toMatchObject({ kind: 'repaired', settings: { furigana: 'recommended', speechRate: 'slow', soundEffects: true, textSpeed: 'fast' } })
  })

  it('容量不足で保存できなくても例外を投げない', () => {
    const storage = new MemoryStorage()
    storage.failOnSet = quotaError()
    expect(saveSettings(storage, DEFAULT_SETTINGS)).toMatchObject({ ok: false, reason: 'quota' })
  })
})
