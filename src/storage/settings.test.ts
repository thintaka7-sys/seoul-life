import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_KEY, defaultSettings, loadSettings, saveSettings, type Settings } from './settings'
import { MemoryStorage, quotaError } from './testing'

describe('設定の保存と読み込み', () => {
  it('保存されていなければ初期値（フリガナはおすすめ、訳はいつも表示、読み上げ・文字送りはふつう、効果音はオン、演出はふつう、音声入力はオンで説明は未読）', () => {
    expect(loadSettings(new MemoryStorage())).toEqual({ kind: 'default', settings: DEFAULT_SETTINGS })
    expect(DEFAULT_SETTINGS).toEqual({
      version: 4,
      furigana: 'recommended',
      translation: 'always',
      speechRate: 'normal',
      textSpeed: 'normal',
      soundEffects: true,
      effects: 'normal',
      voiceInput: true,
      voiceInputNoticeSeen: false,
      slowSpeech: null,
    })
  })

  it('端末で「動きを減らす」がオンなら、演出の初期値は控えめ', () => {
    expect(loadSettings(new MemoryStorage(), { prefersReducedMotion: true }).settings.effects).toBe('reduced')
    expect(loadSettings(null, { prefersReducedMotion: true }).settings.effects).toBe('reduced')
    expect(defaultSettings(true)).toEqual({ ...DEFAULT_SETTINGS, effects: 'reduced' })
  })

  it('v1 の設定は、フリガナと読み上げを引き継いで v4 にする（増えた項目は初期値）', () => {
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

  it('v2 の設定は、すべての項目を引き継いで v4 にする（訳・音声入力・ゆっくりの読み上げは初期値）', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 2, furigana: 'off', speechRate: 'slow', textSpeed: 'fast', soundEffects: false, effects: 'reduced' }))
    expect(loadSettings(storage)).toEqual({
      kind: 'ok',
      settings: { ...DEFAULT_SETTINGS, furigana: 'off', speechRate: 'slow', textSpeed: 'fast', soundEffects: false, effects: 'reduced' },
    })
  })

  it('v3 の設定は、すべての項目を引き継いで v4 にする（ゆっくりの読み上げは、まだ確かめていない）', () => {
    const storage = new MemoryStorage()
    const { slowSpeech: _omit, ...v3 } = { ...DEFAULT_SETTINGS, version: 3, furigana: 'off', translation: 'tap', voiceInputNoticeSeen: true }
    storage.setItem(SETTINGS_KEY, JSON.stringify(v3))
    expect(loadSettings(storage)).toEqual({ kind: 'ok', settings: { ...DEFAULT_SETTINGS, furigana: 'off', translation: 'tap', voiceInputNoticeSeen: true } })
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
      version: 4,
      furigana: 'tap',
      translation: 'off',
      speechRate: 'slow',
      textSpeed: 'instant',
      soundEffects: false,
      effects: 'reduced',
      voiceInput: false,
      voiceInputNoticeSeen: true,
      slowSpeech: { rate: 0.35, measuredAt: '2026-11-22T10:00:00.000Z' },
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
