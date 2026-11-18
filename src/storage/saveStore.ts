// セーブデータの読み込み・保存・退避。
// 保存先は KeyValueStorage（localStorage と同じ形）として受け取るので、将来 IndexedDB などに替えるときもここだけ直せばよい。
// どの関数も例外を投げず、結果を値で返す（保存の失敗でゲームを止めないため）。

import { MIGRATIONS, migrate, type MigrationTable } from './migrations'
import { CURRENT_SAVE_VERSION, isSaveData, type SaveData } from './saveData'

/** localStorage と同じ形の保存先 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

// 同じ <ユーザー名>.github.io の別リポジトリとも localStorage を共有するため、必ずゲーム名を付ける
export const SAVE_KEY = 'seoul-life:save'
export const BACKUP_KEY_PREFIX = 'seoul-life:save-backup:'
/** 退避データを何個まで残すか（古いものから消す） */
export const MAX_BACKUPS = 3

export type CorruptReason = 'parse_error' | 'invalid_shape' | 'newer_version' | 'migration_failed'

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; data: SaveData; raw: string; migratedFrom: number | null }
  | { kind: 'corrupt'; reason: CorruptReason; detail: string; raw: string }
  | { kind: 'unavailable' }

export interface LoadOptions {
  migrations?: MigrationTable
  currentVersion?: number
  validate?: (v: unknown) => v is SaveData
}

export function loadSave(storage: KeyValueStorage | null, options: LoadOptions = {}): LoadResult {
  if (storage === null) return { kind: 'unavailable' }
  let raw: string | null
  try {
    raw = storage.getItem(SAVE_KEY)
  } catch {
    return { kind: 'unavailable' }
  }
  if (raw === null) return { kind: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'corrupt', reason: 'parse_error', detail: 'JSONとして読めません', raw }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'corrupt', reason: 'invalid_shape', detail: 'セーブデータの形ではありません', raw }
  }

  const migrated = migrate(parsed as Record<string, unknown>, options.migrations ?? MIGRATIONS, options.currentVersion ?? CURRENT_SAVE_VERSION)
  if (!migrated.ok) return { kind: 'corrupt', reason: migrated.reason, detail: migrated.detail, raw }

  const validate = options.validate ?? isSaveData
  if (!validate(migrated.data)) {
    return { kind: 'corrupt', reason: 'invalid_shape', detail: '必要な項目が欠けているか、値が正しくありません', raw }
  }
  const currentVersion = options.currentVersion ?? CURRENT_SAVE_VERSION
  return { kind: 'ok', data: migrated.data, raw, migratedFrom: migrated.from === currentVersion ? null : migrated.from }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota' | 'unknown'; detail: string }

function isQuotaError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

export function saveGame(storage: KeyValueStorage | null, data: SaveData): SaveResult {
  if (storage === null) return { ok: false, reason: 'unavailable', detail: 'このブラウザでは保存できません' }
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data))
    return { ok: true }
  } catch (e) {
    if (isQuotaError(e)) return { ok: false, reason: 'quota', detail: '保存容量がいっぱいです' }
    return { ok: false, reason: 'unknown', detail: String(e) }
  }
}

/** 退避データのキーの一覧（古い順） */
export function listBackupKeys(storage: KeyValueStorage): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k !== null && k.startsWith(BACKUP_KEY_PREFIX)) keys.push(k)
    }
  } catch {
    return []
  }
  // キーは「接頭辞 + ISO形式の日時 + :種類」なので、文字列として並べれば古い順になる
  return keys.sort()
}

/**
 * 読み込めなかったデータや、移行前のデータを別のキーに写して残す。
 * 元のキー（SAVE_KEY）には触らない。退避先のキーを返し、失敗したら null。
 */
export function backupRawSave(storage: KeyValueStorage, raw: string, label: 'corrupt' | 'pre-migration', now: Date): string | null {
  // 壊れたデータのまま再読み込みを繰り返しても、同じ内容を何度も退避して古い退避データを押し出さないようにする
  for (const existing of listBackupKeys(storage)) {
    try {
      if (storage.getItem(existing) === raw) return existing
    } catch {
      break
    }
  }
  const key = `${BACKUP_KEY_PREFIX}${now.toISOString()}:${label}`
  try {
    storage.setItem(key, raw)
  } catch {
    return null
  }
  const keys = listBackupKeys(storage)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) {
    try {
      storage.removeItem(old)
    } catch {
      // 古い退避データを消せなくても、新しい退避はできているので続ける
    }
  }
  return key
}
