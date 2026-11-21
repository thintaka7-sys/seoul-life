// 答えた後の見せ方（GAME_SPEC 4-0）：自分の答えと正解の、違うところを求める。
// 判定と同じ形に整えてから（空白・句読点・全角半角・NFC。judgeAnswer の normalizeAnswer）、1文字（ハングルは1音節）ずつ比べる。
// 両方に共通する文字の並び（最長共通部分列）を「同じ」とし、残りを「違う」とする。
// - 自分の答えの「違う」文字：間違えた文字・余分な文字
// - 正解の「違う」文字：正しい文字・足りない文字

import { normalizeAnswer } from '../judge/judgeAnswer'
import { normalizeDigits } from '../practice/judge'

export interface DiffPart {
  text: string
  /** 相手の文にない文字か */
  diff: boolean
}

export interface AnswerDiff {
  /** 自分の答え（整えた形） */
  given: DiffPart[]
  /** 比べた正解（整えた形） */
  expected: DiffPart[]
  /** 比べた正解（データに書かれたままの形） */
  target: string
  /** 違う文字の数（0 なら同じ） */
  distance: number
}

/** 最長共通部分列で、それぞれの文字が共通部分に入るかを求める */
function commonMarks(a: readonly string[], b: readonly string[]): { inA: boolean[]; inB: boolean[]; length: number } {
  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Array<number>(rows * cols).fill(0)
  const at = (i: number, j: number) => table[i * cols + j] ?? 0
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const inA = a.map(() => false)
  const inB = b.map(() => false)
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      inA[i] = true
      inB[j] = true
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      i++
    } else {
      j++
    }
  }
  return { inA, inB, length: at(0, 0) }
}

/** 文字ごとの印を、続いた同じ印でまとめる */
function toParts(chars: readonly string[], common: readonly boolean[]): DiffPart[] {
  const parts: DiffPart[] = []
  chars.forEach((c, i) => {
    const diff = !(common[i] ?? false)
    const last = parts.at(-1)
    if (last !== undefined && last.diff === diff) last.text += c
    else parts.push({ text: c, diff })
  })
  return parts
}

/** 整えた2つの文を比べる */
export function diffText(given: string, expected: string): Omit<AnswerDiff, 'target'> {
  const a = [...given]
  const b = [...expected]
  const { inA, inB, length } = commonMarks(a, b)
  return { given: toParts(a, inA), expected: toParts(b, inB), distance: a.length + b.length - 2 * length }
}

/**
 * 書いた答えを、正解として認める文のうち、いちばん近いものと比べる。
 * 正解が1つもなければ null
 */
export function diffAnswer(given: string, answers: readonly string[]): AnswerDiff | null {
  const g = normalizeAnswer(given)
  let best: AnswerDiff | null = null
  for (const answer of answers) {
    const d = diffText(g, normalizeAnswer(answer))
    if (best === null || d.distance < best.distance) best = { ...d, target: answer }
  }
  return best
}

/** 数字の答えを比べる（カンマ・単位・全角を整えてから。数字がなければ書いたまま） */
export function diffDigits(given: string, digits: string): AnswerDiff {
  const g = normalizeDigits(given) ?? given.trim()
  return { ...diffText(g, normalizeDigits(digits) ?? digits), target: digits }
}
