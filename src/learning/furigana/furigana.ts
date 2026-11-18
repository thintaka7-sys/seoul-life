// フリガナ（カタカナの読み）を、韓国語の区切り（空白）ごとに付ける処理と、表示するかどうかの判定。

import type { FuriganaMode } from '../../storage/settings'

const PUNCTUATION_ONLY = /^[\p{P}\p{S}]+$/u

export interface RubySegment {
  /** 韓国語の区切り（句読点を含む） */
  base: string
  /** その区切りの読み。句読点だけの区切りには付けない（null） */
  ruby: string | null
}

/**
 * 韓国語と読みを区切りごとに組にする。区切りの数が合わないときは null（フリガナなしで表示する）。
 * 数が合うことはデータの検証で確かめているが、表示の側でも崩れないようにする。
 */
export function pairReading(korean: string, reading: string): RubySegment[] | null {
  const bases = korean.trim().split(/\s+/).filter((t) => t !== '')
  const readings = reading.trim().split(/\s+/).filter((t) => t !== '')
  const segments: RubySegment[] = []
  let r = 0
  for (const base of bases) {
    if (PUNCTUATION_ONLY.test(base)) {
      segments.push({ base, ruby: null })
      continue
    }
    const ruby = readings[r]
    if (ruby === undefined) return null
    segments.push({ base, ruby })
    r++
  }
  return r === readings.length ? segments : null
}

/** show：いつも表示、tap：タップしたときだけ表示、hide：表示しない */
export type FuriganaDisplay = 'show' | 'tap' | 'hide'

/** 設定と、その文の章から、フリガナの出し方を決める（GAME_SPEC 9-3） */
export function furiganaDisplay(mode: FuriganaMode, chapter: number, alwaysUntilChapter: number): FuriganaDisplay {
  switch (mode) {
    case 'recommended':
      return chapter <= alwaysUntilChapter ? 'show' : 'tap'
    case 'always':
      return 'show'
    case 'tap':
      return 'tap'
    case 'off':
      return 'hide'
  }
}
