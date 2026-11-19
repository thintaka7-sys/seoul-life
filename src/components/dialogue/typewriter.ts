// 文字送りの計算（画面なしでテストできる純粋な関数）。

import type { RubySegment } from '../../learning/furigana/furigana'
import type { TextSpeed } from '../../storage/settings'

/** 1文字を表示する間隔（ミリ秒）。instant は文字送りなし */
export const TEXT_SPEED_MS: Readonly<Record<TextSpeed, number>> = {
  instant: 0,
  fast: 25,
  normal: 45,
  slow: 80,
}

/** 区切りの文字数（区切りの間の空白も1文字として数える） */
export function totalChars(segments: readonly RubySegment[]): number {
  return segments.reduce((sum, s, i) => sum + [...s.base].length + (i > 0 ? 1 : 0), 0)
}

export interface RevealedSegment {
  /** 見えている部分 */
  shown: string
  /** まだ見えていない部分（場所だけ取っておき、文字が増えても行がずれないようにする） */
  hidden: string
  /** その区切りをすべて表示し終えたか（フリガナは区切りを表示し終えてから出す） */
  complete: boolean
  ruby: string | null
  /** 区切りの前の空白が見えているか */
  spaceShown: boolean
}

/** visible 文字目までを見せたときの、区切りごとの見え方 */
export function revealSegments(segments: readonly RubySegment[], visible: number): RevealedSegment[] {
  let left = Math.max(0, visible)
  return segments.map((s, i) => {
    let spaceShown = true
    if (i > 0) {
      spaceShown = left > 0
      left = Math.max(0, left - 1)
    }
    const chars = [...s.base]
    const n = Math.min(chars.length, left)
    left -= n
    return { shown: chars.slice(0, n).join(''), hidden: chars.slice(n).join(''), complete: n === chars.length, ruby: s.ruby, spaceShown }
  })
}

/** 韓国語の文を、読みのない区切りの並びにする（読みがない文の文字送りに使う） */
export function plainSegments(korean: string): RubySegment[] {
  return korean
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '')
    .map((base) => ({ base, ruby: null }))
}
