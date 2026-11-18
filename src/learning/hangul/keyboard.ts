// ゲーム内ハングルキーボード（2ボル式）の配列と、入力の組み立て。
// 字母を音節に組み立てる処理は es-hangul（MIT）を使う。

import { assemble, removeLastCharacter } from 'es-hangul'

/** 2ボル式の配列（Shift なし） */
export const KEY_ROWS: readonly (readonly string[])[] = [
  ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'],
  ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
  ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ'],
]

/** Shift を押したときに変わる字母（濃音と ㅒ・ㅖ） */
export const SHIFTED: Readonly<Record<string, string>> = {
  ㅂ: 'ㅃ',
  ㅈ: 'ㅉ',
  ㄷ: 'ㄸ',
  ㄱ: 'ㄲ',
  ㅅ: 'ㅆ',
  ㅐ: 'ㅒ',
  ㅔ: 'ㅖ',
}

export function keyLabel(jamo: string, shift: boolean): string {
  return shift ? (SHIFTED[jamo] ?? jamo) : jamo
}

/** 入力済みの文字列の末尾に字母を足し、音節に組み立てる（例：가 ＋ ㅇ → 강、강 ＋ ㅏ → 가아） */
export function typeJamo(text: string, jamo: string): string {
  return assemble([text, jamo])
}

/** 最後の字母を1つ消す（例：강 → 가、가 → ㄱ、末尾の空白はそのまま消す） */
export function backspace(text: string): string {
  if (text === '') return ''
  if (text.endsWith(' ')) return text.slice(0, -1)
  return removeLastCharacter(text)
}

/** 空白を入れる（続けて入れない・先頭には入れない） */
export function typeSpace(text: string): string {
  if (text === '' || text.endsWith(' ')) return text
  return `${text} `
}
