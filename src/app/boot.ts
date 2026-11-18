// 起動時のセーブデータの読み込み。React の描画より前に1回だけ実行する。

import { backupRawSave, loadSave, type KeyValueStorage, type LoadResult } from '../storage/saveStore'

export interface BootResult {
  storage: KeyValueStorage | null
  load: LoadResult
  /** 元のデータを退避したキー。退避が不要、または失敗した場合は null */
  backupKey: string | null
}

export function boot(storage: KeyValueStorage | null, now: Date): BootResult {
  const load = loadSave(storage)
  let backupKey: string | null = null
  if (storage !== null) {
    // 読めないデータは、新規開始で上書きされる前に別のキーへ写しておく
    if (load.kind === 'corrupt') backupKey = backupRawSave(storage, load.raw, 'corrupt', now)
    // 移行したデータは、移行後の形式で上書き保存する前に移行前の形を残しておく
    if (load.kind === 'ok' && load.migratedFrom !== null) backupKey = backupRawSave(storage, load.raw, 'pre-migration', now)
  }
  return { storage, load, backupKey }
}
