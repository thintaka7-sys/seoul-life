// セーブデータの形。形式を変えるときは:
// 1. 新しいバージョンの型を追加し、CURRENT_SAVE_VERSION を上げる
// 2. migrations.ts に「旧バージョン → 新バージョン」の変換を追加する
// 3. 変換のテストを書く

export const CURRENT_SAVE_VERSION = 1

export interface SaveDataV1 {
  version: 1
  /** 最初に始めた日時（ISO形式） */
  createdAt: string
  /** 最後に保存した日時（ISO形式） */
  updatedAt: string
  progress: {
    /** いま入っている施設のID。街（マップ）にいるときは null */
    currentLocationId: string | null
  }
}

/** 現在のバージョンのセーブデータ */
export type SaveData = SaveDataV1

export function createNewSave(nowIso: string): SaveData {
  return {
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    progress: { currentLocationId: null },
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

/** 現在のバージョンのセーブデータとして正しい形かを確かめる */
export function isSaveData(v: unknown): v is SaveData {
  if (!isObj(v)) return false
  if (v['version'] !== 1) return false
  if (!isIsoDate(v['createdAt']) || !isIsoDate(v['updatedAt'])) return false
  const progress = v['progress']
  if (!isObj(progress)) return false
  const loc = progress['currentLocationId']
  return loc === null || typeof loc === 'string'
}
