// テスト用のメモリ上の保存先。localStorage の失敗（容量不足・アクセス拒否）も再現できる。

import type { KeyValueStorage } from './saveStore'

export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>()
  /** setItem で投げる例外（容量不足などの再現用） */
  failOnSet: Error | null = null
  /** getItem で投げる例外（アクセス拒否の再現用） */
  failOnGet: Error | null = null

  get length(): number {
    return this.map.size
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    if (this.failOnGet) throw this.failOnGet
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failOnSet) throw this.failOnSet
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  keys(): string[] {
    return [...this.map.keys()]
  }
}

export function quotaError(): Error {
  const e = new Error('The quota has been exceeded.')
  e.name = 'QuotaExceededError'
  return e
}
