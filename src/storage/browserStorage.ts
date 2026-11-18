import type { KeyValueStorage } from './saveStore'

const PROBE_KEY = 'seoul-life:probe'

/**
 * ブラウザの localStorage を返す。使えない環境（保存がブロックされている、容量が0など）では null。
 * 実際に書き込んで消せるかまで確かめる。
 */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage
    storage.setItem(PROBE_KEY, '1')
    storage.removeItem(PROBE_KEY)
    return storage
  } catch {
    return null
  }
}
