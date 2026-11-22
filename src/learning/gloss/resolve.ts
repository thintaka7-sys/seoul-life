// 台詞・本文のどの語句をタップできるかを決める（GAME_SPEC 4-8。書き方は docs/CONTENT_FORMAT.md 21章）。
// 1. 教材に書いた glosses（字が単語の教材と一致しない語句）
// 2. 単語の教材の見出し語・別表記・元の形・形が変わった言葉と、字がそのまま同じ語句（自動）
// 文を空白で区切ったまとまり（前後の句読点は外す）で比べ、左から順に、長い語句を先に探す。重なる語句は作らない。

import type { Gloss, Vocab } from '../../data/types'
import { textChunks } from './chunks'

const EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu

/** タップしたときに見せるもの */
export type GlossTarget =
  /** 単語の教材（図鑑の内容を出し、「覚える」で復習に加えられる） */
  | { kind: 'vocab'; vocabId: string; noteJa?: string }
  /** 教材に直接書いた読み・意味（「覚える」はない） */
  | { kind: 'note'; pronunciation: string; japanese: string; noteJa?: string }

/** タップできる語句。start〜end は、文を空白で区切った区切り（句読点だけの区切りも数える）の番号（end は含まない） */
export interface GlossSpan {
  start: number
  end: number
  /** 文の中の語句（句読点を外したもの） */
  text: string
  target: GlossTarget
}

/** 自動でつなぐための、語句 → 単語ID の索引 */
export type GlossIndex = ReadonlyMap<string, string>

function key(text: string): string {
  return textChunks(text).join(' ')
}

/** 単語の教材から索引を作る。同じ語句が複数の単語にあるときは、先に出てきた単語にする */
export function buildGlossIndex(vocabulary: readonly Vocab[]): GlossIndex {
  const index = new Map<string, string>()
  const add = (text: string, id: string) => {
    const k = key(text)
    if (k !== '' && !index.has(k)) index.set(k, id)
  }
  // 見出し語を先に入れ、形が変わった言葉などは後から（見出し語どうしの重なりを優先する）
  for (const v of vocabulary) add(v.korean, v.id)
  for (const v of vocabulary) {
    for (const alt of v.alternatives ?? []) add(alt, v.id)
    if (v.base !== undefined) add(v.base.korean, v.id)
    for (const f of v.forms ?? []) add(f.korean, v.id)
  }
  return index
}

function glossTarget(g: Gloss): GlossTarget | null {
  if (g.vocab !== undefined) return g.noteJa === undefined ? { kind: 'vocab', vocabId: g.vocab } : { kind: 'vocab', vocabId: g.vocab, noteJa: g.noteJa }
  if (g.pronunciation === undefined || g.japanese === undefined) return null
  const t: GlossTarget = { kind: 'note', pronunciation: g.pronunciation, japanese: g.japanese }
  if (g.noteJa !== undefined) t.noteJa = g.noteJa
  return t
}

/** 文の中のタップできる語句を、左から順に返す */
export function resolveGlosses(korean: string, glosses: readonly Gloss[] | undefined, index: GlossIndex): GlossSpan[] {
  const tokens = korean
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '')
    .map((t) => t.replace(EDGE_PUNCTUATION, ''))
  const explicit = new Map<string, GlossTarget>()
  for (const g of glosses ?? []) {
    const target = glossTarget(g)
    if (target !== null) explicit.set(key(g.text), target)
  }
  const maxWords = Math.max(1, ...[...explicit.keys(), ...index.keys()].map((k) => k.split(' ').length))

  const spans: GlossSpan[] = []
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] === '') {
      i++
      continue
    }
    let found: GlossSpan | null = null
    for (let len = Math.min(maxWords, tokens.length - i); len >= 1 && found === null; len--) {
      const words = tokens.slice(i, i + len)
      // 句読点だけの区切りをまたぐ語句は作らない
      if (words.some((w) => w === '')) continue
      const text = words.join(' ')
      const target = explicit.get(text) ?? (index.has(text) ? { kind: 'vocab' as const, vocabId: index.get(text) ?? '' } : undefined)
      if (target !== undefined) found = { start: i, end: i + len, text, target }
    }
    if (found !== null) {
      spans.push(found)
      i = found.end
    } else {
      i++
    }
  }
  return spans
}
