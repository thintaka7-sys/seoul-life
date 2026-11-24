// 起動時のセーブデータと設定の読み込み。React の描画より前に1回だけ実行する。

import { backupRawSave, loadSave, type KeyValueStorage, type LoadResult } from '../storage/saveStore'
import { loadSettings, type DefaultSettingsOptions, type SettingsLoadResult } from '../storage/settings'

export interface BootResult {
  storage: KeyValueStorage | null
  load: LoadResult
  /** 元のデータを退避したキー。退避が不要、または失敗した場合は null */
  backupKey: string | null
  settings: SettingsLoadResult
}

/** device：端末のこと（「動きを減らす」がオンか、navigator.audioSession があるか。設定の初期値に使う） */
export function boot(storage: KeyValueStorage | null, now: Date, device: DefaultSettingsOptions = {}): BootResult {
  const load = loadSave(storage)
  let backupKey: string | null = null
  if (storage !== null) {
    // 読めないデータは、新規開始で上書きされる前に別のキーへ写しておく
    if (load.kind === 'corrupt') backupKey = backupRawSave(storage, load.raw, 'corrupt', now)
    // 移行したデータは、移行後の形式で上書き保存する前に移行前の形を残しておく
    if (load.kind === 'ok' && load.migratedFrom !== null) backupKey = backupRawSave(storage, load.raw, 'pre-migration', now)
  }
  const settings = loadSettings(storage, device)
  if (settings.kind === 'repaired') console.warn(`[設定] ${settings.detail}`)
  return { storage, load, backupKey, settings }
}
