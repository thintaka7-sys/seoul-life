// 画面の一部（おはなしなど）が、一時的に背景や BGM を変えるための小さな入れ物。
// おはなしの場面が変わると背景も変わるが、背景は画面の一番外側（App）で敷いているため、ここを通して伝える。

import { useSyncExternalStore } from 'react'
import type { BgmId } from '../data/types'

interface Store<T> {
  get: () => T
  set: (value: T) => void
  subscribe: (listener: () => void) => () => void
}

function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      for (const l of listeners) l()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** おはなしで変えた背景のID（場面の背景か施設ID）。null なら変えていない */
export const backdropOverride = createStore<string | null>(null)

/** おはなしで変えた BGM。null なら場所の曲のまま、none なら止める */
export const bgmOverride = createStore<BgmId | 'none' | null>(null)

export function useBackdropOverride(): string | null {
  return useSyncExternalStore(backdropOverride.subscribe, backdropOverride.get, backdropOverride.get)
}

export function useBgmOverride(): BgmId | 'none' | null {
  return useSyncExternalStore(bgmOverride.subscribe, bgmOverride.get, bgmOverride.get)
}
