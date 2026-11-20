// 話した答え（音声認識の結果）の判定。書いた答えと同じ回答判定（judgeAnswer）を使う。発音の採点はしない（GAME_SPEC 4-5）。
// - 音声認識は候補を複数返すので、どれか1つが正解なら「通じた」とする。
// - 分かち書きは話した人の誤りではないので、空白の位置の違いは注意なしで正解にする。
// - 認識結果では、数が数字で書かれることがある（한 잔 → 1잔）。話す答えに限り、正解の数の言葉を数字にした形も正解にする（計画 Q12）。
// - 音声認識は、同じ音でも別のつづりを選ぶことがある。話す答えに限り、同じ音として発音される母音（ㅐ・ㅔ など）を同じとみなし、
//   文の頭・終わりのつなぎの声（음・어・으）は無視する（BUG-004、Q1 の A）。意味の違う言葉は通さないため、1字違いなどは許さない。

import { composeSyllable, splitSyllable } from '../hangul/jamo'
import { judgeAnswer } from './judgeAnswer'

/** 今の発音でほぼ区別されない母音を、1つにそろえる（ㅐ＝ㅔ、ㅒ＝ㅖ、ㅙ＝ㅚ＝ㅞ） */
const SAME_SOUND_VOWELS: Readonly<Record<string, string>> = {
  ㅐ: 'ㅔ',
  ㅒ: 'ㅖ',
  ㅙ: 'ㅞ',
  ㅚ: 'ㅞ',
}

/** 同じ音として発音される母音を、1つの書き方にそろえる */
export function unifySameSoundVowels(text: string): string {
  return [...text.normalize('NFC')]
    .map((ch) => {
      const s = splitSyllable(ch)
      const medial = s === null ? undefined : SAME_SOUND_VOWELS[s.medial]
      if (s === null || medial === undefined) return ch
      return composeSyllable(s.initial, medial, s.final) ?? ch
    })
    .join('')
}

/** 考えながら出る声（つなぎの声）。音声認識が文字にしてしまうことがある */
const FILLER = /^(음+|어+|으+|으음|음음)[.,?!。、…~]*$/

/** 文の頭と終わりの、つなぎの声を除く。全部がつなぎの声なら、元のまま返す */
export function stripFillers(text: string): string {
  const tokens = text.trim().split(/\s+/)
  let start = 0
  let end = tokens.length
  while (start < end && FILLER.test(tokens[start] ?? '')) start++
  while (end > start && FILLER.test(tokens[end - 1] ?? '')) end--
  return start === end ? text.trim() : tokens.slice(start, end).join(' ')
}

/** 単独で数を表す固有数詞（하나＝1つ） */
const STANDALONE_NUMERALS: Readonly<Record<string, string>> = {
  하나: '1',
  둘: '2',
  셋: '3',
  넷: '4',
  다섯: '5',
  여섯: '6',
  일곱: '7',
  여덟: '8',
  아홉: '9',
  열: '10',
}

/** 数える単位の前に付く形（한 잔＝1杯）。네（はい）と区別するため、後ろに単位があるときだけ数字にする */
const ATTRIBUTIVE_NUMERALS: Readonly<Record<string, string>> = {
  한: '1',
  두: '2',
  세: '3',
  네: '4',
  다섯: '5',
  여섯: '6',
  일곱: '7',
  여덟: '8',
  아홉: '9',
  열: '10',
}

/** 数える単位（잔＝杯、개＝個 など） */
const COUNTERS = ['잔', '개', '명', '병', '장', '권', '마리', '번', '살', '시', '분', '그릇', '인분']

const PUNCTUATION = /[.,?!。、]/g

/** 句読点を除いた語の中身（数の判定用） */
function bare(token: string): string {
  return token.replace(PUNCTUATION, '')
}

/** 1つの正解から、数の言葉を数字にした形を作る。数の言葉がなければ空 */
export function numeralVariant(answer: string): string | null {
  const tokens = answer.trim().split(/\s+/)
  let changed = false
  const out = tokens.map((token, i) => {
    const word = bare(token)
    const rest = token.slice(word.length)
    const next = tokens[i + 1]
    const nextWord = next === undefined ? '' : bare(next)
    const attributive = ATTRIBUTIVE_NUMERALS[word]
    if (attributive !== undefined && COUNTERS.some((c) => nextWord.startsWith(c))) {
      changed = true
      return attributive + rest
    }
    const standalone = STANDALONE_NUMERALS[word]
    if (standalone !== undefined) {
      changed = true
      return standalone + rest
    }
    return token
  })
  return changed ? out.join(' ') : null
}

export type SpokenJudge =
  /** 通じた。matched は一致した正解（データに書かれたままの形）、heard は一致した認識結果 */
  | { kind: 'correct'; matched: string; heard: string }
  /** 通じなかった。heard は最も確からしい認識結果（なければ空） */
  | { kind: 'incorrect'; heard: string }

/** 音声認識の候補（確からしい順）を、正解の一覧と比べる */
export function judgeSpoken(alternatives: readonly string[], answers: readonly string[]): SpokenJudge {
  // 数字にした形 → 元の正解
  const original = new Map<string, string>()
  for (const a of answers) {
    original.set(a, a)
    const v = numeralVariant(a)
    if (v !== null && !original.has(v)) original.set(v, a)
  }
  // 母音をそろえた形 → 元の正解
  const unified = new Map<string, string>()
  for (const [form, answer] of original) {
    const u = unifySameSoundVowels(form)
    if (!unified.has(u)) unified.set(u, answer)
  }
  const candidates = [...unified.keys()]
  for (const heard of alternatives) {
    for (const form of new Set([heard, stripFillers(heard)])) {
      const result = judgeAnswer(unifySameSoundVowels(form), candidates)
      if (result.kind !== 'incorrect') return { kind: 'correct', matched: unified.get(result.matched) ?? result.matched, heard }
    }
  }
  return { kind: 'incorrect', heard: alternatives[0]?.trim() ?? '' }
}
