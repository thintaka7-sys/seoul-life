// レベル（GAME_SPEC 7-2）。経験値から計算する（セーブデータには持たない）。表は balance.json の levels。

import type { Balance } from '../../data/types'

type Levels = Balance['levels']

/** レベル n になるのに要る経験値の合計。表の最後より先は stepAfter ずつ増やす */
export function thresholdOf(level: number, levels: Levels): number {
  const { thresholds, stepAfter } = levels
  if (level <= 1) return 0
  const inTable = thresholds[level - 1]
  if (inTable !== undefined) return inTable
  const last = thresholds[thresholds.length - 1] ?? 0
  return last + (level - thresholds.length) * stepAfter
}

/** 経験値から、いまのレベル */
export function levelOf(xp: number, levels: Levels): number {
  let level = 1
  while (thresholdOf(level + 1, levels) <= xp) level++
  return level
}

export interface LevelProgress {
  level: number
  /** いまのレベルになってから得た経験値 */
  current: number
  /** 次のレベルまでに要る経験値（いまのレベルの幅） */
  needed: number
  /** 次のレベルになる経験値の合計 */
  nextAt: number
}

export function levelProgress(xp: number, levels: Levels): LevelProgress {
  const level = levelOf(xp, levels)
  const from = thresholdOf(level, levels)
  const nextAt = thresholdOf(level + 1, levels)
  return { level, current: xp - from, needed: nextAt - from, nextAt }
}
