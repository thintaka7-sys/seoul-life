import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings, type Settings } from './settings'
import { MemoryStorage, quotaError } from './testing'

describe('設定の保存と読み込み', () => {
  it('保存されていなければ初期値（フリガナはおすすめ、読み上げはふつう）', () => {
    expect(loadSettings(new MemoryStorage())).toEqual({ kind: 'default', settings: DEFAULT_SETTINGS })
    expect(DEFAULT_SETTINGS).toMatchObject({ furigana: 'recommended', speechRate: 'normal' })
  })

  it('保存した設定を読み込める', () => {
    const storage = new MemoryStorage()
    const settings: Settings = { version: 1, furigana: 'tap', speechRate: 'slow' }
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
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, furigana: 'sometimes', speechRate: 'slow' }))
    expect(loadSettings(storage)).toMatchObject({ kind: 'repaired', settings: { furigana: 'recommended', speechRate: 'slow' } })
  })

  it('容量不足で保存できなくても例外を投げない', () => {
    const storage = new MemoryStorage()
    storage.failOnSet = quotaError()
    expect(saveSettings(storage, DEFAULT_SETTINGS)).toMatchObject({ ok: false, reason: 'quota' })
  })
})
