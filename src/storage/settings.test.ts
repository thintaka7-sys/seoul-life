import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_KEY, defaultSettings, loadSettings, saveSettings, type Settings } from './settings'
import { MemoryStorage, quotaError } from './testing'

describe('設定の保存と読み込み', () => {
  it('保存されていなければ初期値（フリガナはおすすめ、読み上げ・文字送りはふつう、効果音はオン、演出はふつう）', () => {
    expect(loadSettings(new MemoryStorage())).toEqual({ kind: 'default', settings: DEFAULT_SETTINGS })
    expect(DEFAULT_SETTINGS).toEqual({ version: 2, furigana: 'recommended', speechRate: 'normal', textSpeed: 'normal', soundEffects: true, effects: 'normal' })
  })

  it('端末で「動きを減らす」がオンなら、演出の初期値は控えめ', () => {
    expect(loadSettings(new MemoryStorage(), { prefersReducedMotion: true }).settings.effects).toBe('reduced')
    expect(loadSettings(null, { prefersReducedMotion: true }).settings.effects).toBe('reduced')
    expect(defaultSettings(true)).toEqual({ ...DEFAULT_SETTINGS, effects: 'reduced' })
  })

  it('v1 の設定は、フリガナと読み上げを引き継いで v2 にする（増えた項目は初期値）', () => {
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

  it('保存した設定を読み込める', () => {
    const storage = new MemoryStorage()
    const settings: Settings = { version: 2, furigana: 'tap', speechRate: 'slow', textSpeed: 'instant', soundEffects: false, effects: 'reduced' }
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
