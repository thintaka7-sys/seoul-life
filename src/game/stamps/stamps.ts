// 毎日のスタンプ（GAME_SPEC 7-6）。日付は端末の日付（YYYY-MM-DD）で数える。
// 休んだ日があっても、集めたスタンプは消さない（続けられなかったことを責めない）。

import { addDays } from '../../learning/review/dates'

/** その日にスタンプを押す（押してあればそのまま）。日付の古い順に並べる */
export function withStamp(stamps: readonly string[], date: string): string[] {
  if (stamps.includes(date)) return [...stamps]
  return [...stamps, date].sort()
}

/**
 * いま続いている日数。今日押していれば今日から、まだなら昨日からさかのぼって数える
 * （今日まだ押していないだけで、続いている日数を 0 に見せないため）
 */
export function currentStreak(stamps: readonly string[], today: string): number {
  const set = new Set(stamps)
  let day = set.has(today) ? today : addDays(today, -1)
  let count = 0
  while (set.has(day)) {
    count++
    day = addDays(day, -1)
  }
  return count
}

/** カレンダーの1か月分。週は日曜始まり。前後の月の日は null */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const startWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array<null>(startWeekday).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** 年と月を足し引きする（month は 1〜12） */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}
