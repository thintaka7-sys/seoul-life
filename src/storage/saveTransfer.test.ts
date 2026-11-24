import { describe, expect, it } from 'vitest'
import { CURRENT_SAVE_VERSION, createNewSave, type SaveData } from './saveData'
import { BACKUP_KEY_PREFIX, SAVE_KEY, backupCurrentSave } from './saveStore'
import { EXPORT_FORMAT, EXPORT_REMINDER_DAYS, EXPORT_VERSION, createExport, isExportReminderDue, exportFileName, parseExport, portableSettings, serializeExport } from './saveTransfer'
import { DEFAULT_SETTINGS, DEVICE_SETTING_KEYS, type Settings } from './settings'
import { MemoryStorage } from './testing'

const T = '2026-11-25T12:00:00.000Z'

function playedSave(): SaveData {
  const save = createNewSave('2026-11-20T09:00:00.000Z')
  return {
    ...save,
    progress: { ...save.progress, completedEvents: ['event_004', 'event_005'], currentLocationId: 'home' },
    learning: { ...save.learning, words: { vocab_001: { learnedAt: '2026-11-20T09:10:00.000Z', chapter: 1 } } },
    stats: { xp: 120 },
    daily: { stamps: ['2026-11-20', '2026-11-21'] },
  }
}

/** この端末の設定（端末ごとの値も入っている） */
const deviceA: Settings = {
  ...DEFAULT_SETTINGS,
  furigana: 'tap',
  bgmVolume: 30,
  slowSpeech: { rate: 0.35, measuredAt: '2026-11-22T10:00:00.000Z' },
  quietAfterVoiceInput: true,
  lastExportAt: '2026-11-24T08:00:00.000Z',
}

/** 読み込む端末の設定 */
const deviceB: Settings = { ...DEFAULT_SETTINGS, furigana: 'off', slowSpeech: null, quietAfterVoiceInput: false, lastExportAt: null }

describe('書き出しファイル', () => {
  it('セーブデータと設定を入れる。設定の端末ごとの値（ゆっくりの速さ・話した後に止めるか・書き出した日）は入れない', () => {
    const file = createExport(playedSave(), deviceA, T)
    expect(file).toMatchObject({ format: EXPORT_FORMAT, exportVersion: EXPORT_VERSION, exportedAt: T, save: playedSave() })
    for (const key of DEVICE_SETTING_KEYS) expect(file.settings, key).not.toHaveProperty(key)
    expect(file.settings).toMatchObject({ furigana: 'tap', bgmVolume: 30, version: 7 })
    expect(portableSettings(deviceA)).toEqual(file.settings)
  })

  it('ファイルの名前は、端末の日時から作る', () => {
    expect(exportFileName(new Date(2026, 10, 5, 9, 3))).toBe('seoul-life-20261105-0903.json')
  })

  it('書き出して読み込むと、元のセーブデータと設定に戻る。端末ごとの値は、読み込んだ端末のまま', () => {
    const text = serializeExport(createExport(playedSave(), deviceA, T))
    const result = parseExport(text, deviceB)
    expect(result).toEqual({
      ok: true,
      save: playedSave(),
      settings: { ...deviceA, slowSpeech: null, quietAfterVoiceInput: false, lastExportAt: null },
      exportedAt: T,
      migratedFrom: null,
    })
  })

  it('古い形式のセーブデータが入ったファイルは、今の形式に移して読み込む', () => {
    const file = { format: EXPORT_FORMAT, exportVersion: 1, exportedAt: T, save: { version: 1, createdAt: T, updatedAt: T, progress: { currentLocationId: null } }, settings: { version: 1, furigana: 'tap', speechRate: 'slow' } }
    const result = parseExport(JSON.stringify(file), deviceB)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.save.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.migratedFrom).toBe(1)
    expect(result.settings).toMatchObject({ furigana: 'tap', speechRate: 'slow', version: 7 })
  })

  it('設定が読めないファイルでも、セーブデータは読み込み、設定は今のまま', () => {
    const file = { ...createExport(playedSave(), deviceA, T), settings: 'broken' }
    const result = parseExport(JSON.stringify(file), deviceB)
    expect(result).toMatchObject({ ok: true, settings: deviceB })
  })

  it.each([
    ['JSON でない', '{broken', 'parse_error'],
    ['ほかのファイル', JSON.stringify({ hello: 1 }), 'not_export'],
    ['セーブデータそのもの', JSON.stringify(createNewSave(T)), 'not_export'],
    ['新しい版のゲームの書き出し', JSON.stringify({ format: EXPORT_FORMAT, exportVersion: EXPORT_VERSION + 1, exportedAt: T, save: {}, settings: {} }), 'newer_export'],
    ['新しい版のセーブデータ', JSON.stringify({ format: EXPORT_FORMAT, exportVersion: 1, exportedAt: T, save: { ...createNewSave(T), version: CURRENT_SAVE_VERSION + 1 }, settings: {} }), 'newer_version'],
    ['セーブデータがない', JSON.stringify({ format: EXPORT_FORMAT, exportVersion: 1, exportedAt: T, settings: {} }), 'invalid_shape'],
    ['セーブデータの項目が欠けている', JSON.stringify({ format: EXPORT_FORMAT, exportVersion: 1, exportedAt: T, save: { ...createNewSave(T), stats: {} }, settings: {} }), 'invalid_shape'],
    ['書き出した日時がない', JSON.stringify({ format: EXPORT_FORMAT, exportVersion: 1, save: createNewSave(T), settings: {} }), 'invalid_shape'],
  ])('読み込めないファイル（%s）は、理由を返す', (_label, text, reason) => {
    expect(parseExport(text, deviceB)).toMatchObject({ ok: false, reason })
  })
})

describe('読み込む前の退避', () => {
  it('いまのセーブデータを、そのままの文字で別のキーに残す（元のキーはそのまま）', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify(playedSave())
    storage.setItem(SAVE_KEY, raw)
    const result = backupCurrentSave(storage, new Date(T))
    expect(result).toEqual({ key: `${BACKUP_KEY_PREFIX}${T}:before-import`, existed: true })
    expect(storage.getItem(`${BACKUP_KEY_PREFIX}${T}:before-import`)).toBe(raw)
    expect(storage.getItem(SAVE_KEY)).toBe(raw)
  })

  it('セーブデータがなければ何もしない。退避できなければ key が null', () => {
    const storage = new MemoryStorage()
    expect(backupCurrentSave(storage, new Date(T))).toEqual({ key: null, existed: false })
    storage.setItem(SAVE_KEY, '{}')
    storage.failOnSet = new Error('full')
    expect(backupCurrentSave(storage, new Date(T))).toEqual({ key: null, existed: true })
  })
})

describe('書き出しの案内', () => {
  const day = 24 * 60 * 60 * 1000
  const save = playedSave()

  it('まだ進んでいない（終えたイベントがない）データでは案内しない', () => {
    expect(isExportReminderDue(createNewSave('2026-01-01T00:00:00.000Z'), null, new Date(T))).toBe(false)
  })

  it('書き出したことがなければ、遊び始めてから14日たったら案内する', () => {
    const created = Date.parse(save.createdAt)
    expect(EXPORT_REMINDER_DAYS).toBe(14)
    expect(isExportReminderDue(save, null, new Date(created + 13 * day))).toBe(false)
    expect(isExportReminderDue(save, null, new Date(created + 14 * day))).toBe(true)
  })

  it('書き出したことがあれば、その日から14日たったら案内する', () => {
    const last = '2026-11-25T00:00:00.000Z'
    expect(isExportReminderDue(save, last, new Date(Date.parse(last) + 13 * day))).toBe(false)
    expect(isExportReminderDue(save, last, new Date(Date.parse(last) + 14 * day))).toBe(true)
  })
})
