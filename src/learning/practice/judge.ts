// 復習・練習・ドリル・章末テストの答えの判定。
// 書く問題は judgeAnswer（CLAUDE.md「回答判定のルール」）、数字の問題は数字だけを比べる。

import { judgeAnswer, normalizeAnswer } from '../judge/judgeAnswer'
import type { PracticeQuestion } from './questions'

export type PracticeResult =
  /** spacing：正解。ただし分かち書きが違う。matched は一致した正解 */
  | { correct: true; spacing: boolean; matched: string }
  /** digits：韓国語で書く問題に、数字で答えた */
  | { correct: false; digits: boolean }

const FULL_WIDTH = /[０-９：／，]/g

/**
 * 数字の答えを整える：全角を半角に、「3時30分」「5月15日」の 時・月 を : と / に、カンマ・空白・単位（ウォン・원・分 など数字と区切り以外）を除き、
 * 区切り（: と /）ごとに先頭の 0 を除く（03:05 → 3:5、0500 → 500）。数字がなければ null
 */
export function normalizeDigits(input: string): string | null {
  const half = input.replace(FULL_WIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  // 「3時30分」「5月15日」と書いても、3:30・5/15 と同じにする
  const kept = half.replace(/時(?=\s*\d)/g, ':').replace(/月(?=\s*\d)/g, '/').replace(/[^0-9:/]/g, '')
  if (!/[0-9]/.test(kept)) return null
  return kept
    .split(/([:/])/)
    .map((part) => (part === ':' || part === '/' ? part : part.replace(/^0+(?=\d)/, '')))
    .join('')
}

/** 答えに算用数字が入っているか（全角も含む） */
function hasDigits(input: string): boolean {
  return /[0-9０-９]/.test(input)
}

/**
 * 答えを判定する。given は、選ぶ問題なら選んだ選択肢の text、並べ替えなら札をつなげたもの、書く・数字の問題なら入力
 */
export function judgePractice(q: PracticeQuestion, given: string): PracticeResult {
  const body = q.body
  switch (body.type) {
    case 'choose':
      return body.answers.includes(given) ? { correct: true, spacing: false, matched: given } : { correct: false, digits: false }
    case 'arrange':
      return normalizeAnswer(given) === normalizeAnswer(body.answer) ? { correct: true, spacing: false, matched: body.answer } : { correct: false, digits: false }
    case 'write': {
      // 数字の読み方を書く問題では、数字（3500 など）で書いた答えを正解にしない
      if (body.rejectDigits && hasDigits(given)) return { correct: false, digits: true }
      const judge = judgeAnswer(given, body.answers)
      if (judge.kind === 'incorrect') return { correct: false, digits: false }
      return { correct: true, spacing: judge.kind === 'spacing', matched: judge.matched }
    }
    case 'number': {
      const digits = normalizeDigits(given)
      return digits !== null && digits === normalizeDigits(body.digits) ? { correct: true, spacing: false, matched: body.digits } : { correct: false, digits: false }
    }
  }
}
