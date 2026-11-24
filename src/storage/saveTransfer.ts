// セーブデータの書き出し・読み込み（GAME_SPEC 10-2。Phase 4）。
// 書き出すファイルは JSON で、セーブデータと設定を入れる。設定のうち端末ごとの値（DEVICE_SETTING_KEYS）は入れない。
// 読み込むときは、セーブデータを今の形式に移してから確かめる（古い版のゲームで書き出したファイルも読める）。
// ここではブラウザの機能（ファイル・共有）を使わない。ファイルを作る・選ぶのは画面の側（app/saveFile.ts）。

import type { SaveData } from './saveData'
import { parseSaveObject, type CorruptReason, type LoadOptions } from './saveStore'
import { DEVICE_SETTING_KEYS, settingsFromValue, type Settings } from './settings'

/** 書き出しファイルの印（ほかのファイルと見分ける） */
export const EXPORT_FORMAT = 'seoul-life-export'
/** 書き出しファイルの形の版（セーブデータの版とは別。入れ物の形を変えたら上げる） */
export const EXPORT_VERSION = 1

/** 書き出す設定：端末ごとの値を除いたもの */
export type PortableSettings = Omit<Settings, (typeof DEVICE_SETTING_KEYS)[number]>

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  exportVersion: number
  /** 書き出した日時（ISO 8601） */
  exportedAt: string
  save: SaveData
  settings: PortableSettings
}

export function portableSettings(settings: Settings): PortableSettings {
  const copy: Record<string, unknown> = { ...settings }
  for (const key of DEVICE_SETTING_KEYS) delete copy[key]
  return copy as PortableSettings
}

export function createExport(save: SaveData, settings: Settings, nowIso: string): ExportFile {
  return { format: EXPORT_FORMAT, exportVersion: EXPORT_VERSION, exportedAt: nowIso, save, settings: portableSettings(settings) }
}

export function serializeExport(file: ExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 書き出すファイルの名前（端末の時刻で。例：seoul-life-20261125-2130.json） */
export function exportFileName(now: Date): string {
  return `seoul-life-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`
}

export type ImportFailure =
  /** JSON として読めない */
  | 'parse_error'
  /** このゲームの書き出しファイルではない */
  | 'not_export'
  /** 新しい版のゲームで書き出したファイル（入れ物の形が新しい） */
  | 'newer_export'
  | Exclude<CorruptReason, 'parse_error'>

export type ImportResult =
  | {
      ok: true
      save: SaveData
      /** 書き出しファイルに入っていた設定。端末ごとの値は current のまま */
      settings: Settings
      exportedAt: string
      /** 古い形式のセーブデータを移したときは、その版 */
      migratedFrom: number | null
    }
  | { ok: false; reason: ImportFailure; detail: string }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 書き出しファイルの中身を読む。current は今の設定（端末ごとの値を残し、ファイルの設定が読めないときの値にする）。
 * どこかが読めなければ、何も変えずに理由を返す
 */
export function parseExport(text: string, current: Settings, options: LoadOptions = {}): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'parse_error', detail: 'JSON として読めません' }
  }
  if (!isObj(parsed) || parsed['format'] !== EXPORT_FORMAT) {
    return { ok: false, reason: 'not_export', detail: 'このゲームで書き出したファイルではありません' }
  }
  const exportVersion = parsed['exportVersion']
  if (typeof exportVersion !== 'number' || !Number.isInteger(exportVersion) || exportVersion < 1) {
    return { ok: false, reason: 'not_export', detail: '書き出しファイルの版が読めません' }
  }
  if (exportVersion > EXPORT_VERSION) {
    return { ok: false, reason: 'newer_export', detail: `新しい版のゲームで書き出したファイルです（形式 ${exportVersion}）` }
  }
  const exportedAt = parsed['exportedAt']
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    return { ok: false, reason: 'invalid_shape', detail: '書き出した日時が読めません' }
  }

  const loaded = parseSaveObject(parsed['save'], JSON.stringify(parsed['save'] ?? null), options)
  if (loaded.kind !== 'ok') return { ok: false, reason: loaded.reason, detail: loaded.detail }

  // 設定：読める項目だけを使い、端末ごとの値は今の端末のものを残す（読めなければ今の設定のまま）
  const read = settingsFromValue(parsed['settings'], current).settings
  const settings: Settings = { ...read }
  for (const key of DEVICE_SETTING_KEYS) Object.assign(settings, { [key]: current[key] })

  return { ok: true, save: loaded.data, settings, exportedAt, migratedFrom: loaded.migratedFrom }
}

/** 書き出しを案内するまでの日数（最後に書き出した日、まだなら遊び始めた日から。GAME_SPEC 10-2） */
export const EXPORT_REMINDER_DAYS = 14

/**
 * 書き出しを案内するか：進んだデータ（終えたイベントが1つ以上）があり、
 * 最後に書き出してから（まだなら、遊び始めてから）EXPORT_REMINDER_DAYS 日以上たった
 */
export function isExportReminderDue(save: SaveData, lastExportAt: string | null, now: Date): boolean {
  if (save.progress.completedEvents.length === 0) return false
  const since = Date.parse(lastExportAt ?? save.createdAt)
  if (Number.isNaN(since)) return true
  return now.getTime() - since >= EXPORT_REMINDER_DAYS * 24 * 60 * 60 * 1000
}
