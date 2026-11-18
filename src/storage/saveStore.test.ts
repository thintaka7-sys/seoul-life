import { describe, expect, it } from 'vitest'
import { createNewSave, isSaveData, type SaveData } from './saveData'
import { BACKUP_KEY_PREFIX, MAX_BACKUPS, SAVE_KEY, backupRawSave, listBackupKeys, loadSave, saveGame } from './saveStore'
import { MemoryStorage, quotaError } from './testing'

const NOW = '2026-11-18T10:00:00.000Z'

function sampleSave(): SaveData {
  const save = createNewSave(NOW)
  save.progress.currentLocationId = 'cafe'
  return save
}

describe('saveGame と loadSave', () => {
  it('データがなければ empty', () => {
    expect(loadSave(new MemoryStorage())).toEqual({ kind: 'empty' })
  })

  it('保存したデータをそのまま読み込める', () => {
    const storage = new MemoryStorage()
    expect(saveGame(storage, sampleSave())).toEqual({ ok: true })
    const result = loadSave(storage)
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.data).toEqual(sampleSave())
      expect(result.migratedFrom).toBeNull()
    }
  })

  it('保存先がない環境では unavailable', () => {
    expect(loadSave(null)).toEqual({ kind: 'unavailable' })
    expect(saveGame(null, sampleSave())).toMatchObject({ ok: false, reason: 'unavailable' })
  })

  it('読み込みで例外が出る環境（アクセス拒否）でも止まらず unavailable', () => {
    const storage = new MemoryStorage()
    storage.failOnGet = new Error('SecurityError')
    expect(loadSave(storage)).toEqual({ kind: 'unavailable' })
  })

  it('容量不足で保存できないときは quota を返し、例外を投げない', () => {
    const storage = new MemoryStorage()
    storage.failOnSet = quotaError()
    expect(saveGame(storage, sampleSave())).toMatchObject({ ok: false, reason: 'quota' })
  })

  it('その他の保存エラーは unknown を返す', () => {
    const storage = new MemoryStorage()
    storage.failOnSet = new Error('something')
    expect(saveGame(storage, sampleSave())).toMatchObject({ ok: false, reason: 'unknown' })
  })
})

describe('壊れたデータの読み込み', () => {
  function loadRaw(raw: string) {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, raw)
    return { result: loadSave(storage), storage }
  }

  it.each([
    ['JSONとして読めない', '{"version":1,', 'parse_error'],
    ['空文字', '', 'parse_error'],
    ['配列', '[1,2,3]', 'invalid_shape'],
    ['null', 'null', 'invalid_shape'],
    ['version がない', '{"createdAt":"2026-11-18T10:00:00.000Z"}', 'invalid_shape'],
    ['version が文字列', '{"version":"1"}', 'invalid_shape'],
    ['必要な項目が欠けている', '{"version":1,"createdAt":"2026-11-18T10:00:00.000Z"}', 'invalid_shape'],
    ['日時が日時でない', '{"version":1,"createdAt":"x","updatedAt":"y","progress":{"currentLocationId":null}}', 'invalid_shape'],
    ['currentLocationId が数値', `{"version":1,"createdAt":"${NOW}","updatedAt":"${NOW}","progress":{"currentLocationId":3}}`, 'invalid_shape'],
    ['新しいバージョン', `{"version":99,"createdAt":"${NOW}"}`, 'newer_version'],
  ])('%s → corrupt（%s）で、元のデータは消さない', (_label, raw, reason) => {
    const { result, storage } = loadRaw(raw)
    expect(result).toMatchObject({ kind: 'corrupt', reason, raw })
    expect(storage.getItem(SAVE_KEY)).toBe(raw)
  })
})

describe('バージョン移行（loadSave 経由）', () => {
  it('古いバージョン（v1）を v3 まで順に移行して読み込み、移行元のバージョンを返す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, a: 1 }))
    const isV3 = (v: unknown): v is SaveData => typeof v === 'object' && v !== null && (v as { version?: unknown }).version === 3
    const result = loadSave(storage, {
      currentVersion: 3,
      migrations: {
        1: (d) => ({ ...d, version: 2, b: 2 }),
        2: (d) => ({ ...d, version: 3, c: 3 }),
      },
      validate: isV3,
    })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.data).toEqual({ version: 3, a: 1, b: 2, c: 3 })
      expect(result.migratedFrom).toBe(1)
    }
  })

  it('移行処理が足りない・失敗する場合は corrupt（migration_failed）', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1 }))
    expect(loadSave(storage, { currentVersion: 2, migrations: {} })).toMatchObject({ kind: 'corrupt', reason: 'migration_failed' })
    expect(
      loadSave(storage, {
        currentVersion: 2,
        migrations: {
          1: () => {
            throw new Error('boom')
          },
        },
      }),
    ).toMatchObject({ kind: 'corrupt', reason: 'migration_failed' })
    expect(loadSave(storage, { currentVersion: 2, migrations: { 1: (d) => d } })).toMatchObject({ kind: 'corrupt', reason: 'migration_failed' })
  })
})

describe('退避（backupRawSave）', () => {
  it('元のキーを残したまま、別のキーに写す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, 'broken')
    const key = backupRawSave(storage, 'broken', 'corrupt', new Date(NOW))
    expect(key).toBe(`${BACKUP_KEY_PREFIX}${NOW}:corrupt`)
    expect(storage.getItem(key ?? '')).toBe('broken')
    expect(storage.getItem(SAVE_KEY)).toBe('broken')
  })

  it(`退避データは新しいものから ${MAX_BACKUPS} 個まで残す`, () => {
    const storage = new MemoryStorage()
    storage.setItem('other-app:key', 'keep')
    for (let day = 1; day <= MAX_BACKUPS + 2; day++) {
      backupRawSave(storage, `raw${day}`, 'corrupt', new Date(Date.UTC(2026, 10, day)))
    }
    const keys = listBackupKeys(storage)
    expect(keys).toHaveLength(MAX_BACKUPS)
    expect(keys.map((k) => storage.getItem(k))).toEqual(['raw3', 'raw4', 'raw5'])
    expect(storage.getItem('other-app:key')).toBe('keep')
  })

  it('同じ内容がすでに退避されていれば、新しく書かずにそのキーを返す', () => {
    const storage = new MemoryStorage()
    const first = backupRawSave(storage, 'broken', 'corrupt', new Date(NOW))
    const second = backupRawSave(storage, 'broken', 'corrupt', new Date('2026-11-19T00:00:00.000Z'))
    expect(second).toBe(first)
    expect(listBackupKeys(storage)).toHaveLength(1)
  })

  it('書き込めない場合は null を返し、例外を投げない', () => {
    const storage = new MemoryStorage()
    storage.failOnSet = quotaError()
    expect(backupRawSave(storage, 'x', 'corrupt', new Date(NOW))).toBeNull()
  })
})

describe('isSaveData', () => {
  it('新規データは正しい形', () => {
    expect(isSaveData(createNewSave(NOW))).toBe(true)
  })
})
