// ブラウザに、保存データを消さないよう求める（navigator.storage.persist。GAME_SPEC 10-2）。
// 認めるかどうかはブラウザが決める（ホーム画面に追加すると認められやすい）。結果は設定画面に出す。

export type PersistState = 'persisted' | 'not-persisted' | 'unsupported' | 'checking'

interface StorageManagerLike {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
}

/** すでに認められていればそのまま、まだなら求める。例外は投げない */
export async function requestPersistence(manager: StorageManagerLike | undefined): Promise<Exclude<PersistState, 'checking'>> {
  if (manager?.persist === undefined) return 'unsupported'
  try {
    if (manager.persisted !== undefined && (await manager.persisted())) return 'persisted'
    return (await manager.persist()) ? 'persisted' : 'not-persisted'
  } catch {
    return 'not-persisted'
  }
}

let state: PersistState = 'checking'
const listeners = new Set<() => void>()

export function getPersistState(): PersistState {
  return state
}

export function subscribePersist(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 起動時に1回呼ぶ */
export function initPersistence(): void {
  const manager = typeof navigator === 'undefined' ? undefined : (navigator.storage as StorageManagerLike | undefined)
  void requestPersistence(manager).then((result) => {
    state = result
    for (const l of listeners) l()
  })
}
