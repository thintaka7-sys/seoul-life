// ハングルのレッスンの小テストを、教材から自動で作る（GAME_SPEC 4-1）。
// 教材側で問題を1問ずつ書かなくてよいように、文字・音節・単語・音の変化の例から問題を組み立てる。
// 乱数は引数で受け取る（テストで同じ問題を作れるように）。

import type { HangulLesson, Vocab } from '../../data/types'
import { normalizeAnswer } from '../judge/judgeAnswer'
import { composeSyllable, isVowel, splitSyllable } from './jamo'

export type Random = () => number

/** 読む練習の言葉（レッスンの words と、reading のレッスンの vocabulary を同じ形にしたもの） */
export interface ReadingItem {
  korean: string
  pronunciation: string
  japanese: string
}

export type HangulQuestion =
  /** 音を聞いて、文字（音節）を選ぶ。正解は korean。読み上げが使えるときだけ出す */
  | { kind: 'listen'; korean: string; options: string[] }
  /** 文字を見て、読み（カタカナ）を選ぶ */
  | { kind: 'reading'; korean: string; answer: string; options: string[] }
  /** ゲーム内キーボードで、見せた文字を組み立てる */
  | { kind: 'build'; korean: string; reading: string }
  /** 言葉を読んで、意味を選ぶ */
  | { kind: 'meaning'; korean: string; reading: string; answer: string; options: string[] }
  /** 書いた形を見て、発音どおりの形を選ぶ（音の変化） */
  | { kind: 'spoken'; korean: string; reading: string; answer: string; options: string[] }
  /** 音を聞いて、正しいつづりを選ぶ（音の変化。発音どおりに書いた形がまぎらわしい選択肢）。読み上げが使えるときだけ出す */
  | { kind: 'listenSpelling'; korean: string; options: string[] }

export type HangulQuestionKind = HangulQuestion['kind']

/** 選択肢の数（正解を含む） */
const OPTION_COUNT = 3
/** 組み立てる問題に使う言葉の長さ（音節の数）の上限（Phase 2.5 で 3 → 5。レッスン12で使える言葉を増やすため） */
const BUILD_MAX_SYLLABLES = 5

export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = a[i]
    const other = a[j]
    if (tmp === undefined || other === undefined) continue
    a[i] = other
    a[j] = tmp
  }
  return a
}

function pickOne<T>(items: readonly T[], random: Random): T | undefined {
  return items[Math.floor(random() * items.length)]
}

/**
 * 正解とまぎらわしい選択肢を選ぶ。tiers の前のものから順に使う（それぞれの中は並べ替える）。
 * 正解と同じもの・重複するものは使わない。
 */
function distractorsFrom(answer: string, tiers: readonly (readonly string[])[], random: Random): string[] {
  const used = new Set([answer])
  const result: string[] = []
  for (const pool of tiers) {
    for (const c of shuffle(pool, random)) {
      if (result.length >= OPTION_COUNT - 1) return result
      if (used.has(c)) continue
      used.add(c)
      result.push(c)
    }
  }
  return result
}

/** preferred を先に使い、足りなければ others から足す */
function distractors(answer: string, preferred: readonly string[], others: readonly string[], random: Random): string[] {
  return distractorsFrom(answer, [preferred, others], random)
}

/** そのレッスンまでのレッスン（order がそのレッスン以下） */
export function lessonsUpTo(lessons: readonly HangulLesson[], lesson: HangulLesson): HangulLesson[] {
  return lessons.filter((l) => l.order <= lesson.order)
}

/** レッスンの読む練習の言葉（words と、vocabulary の単語） */
export function readingItems(lesson: HangulLesson, vocabById: (id: string) => Vocab | undefined): ReadingItem[] {
  const fromVocab = lesson.vocabulary.flatMap((id) => {
    const v = vocabById(id)
    return v === undefined ? [] : [{ korean: v.korean, pronunciation: v.pronunciation, japanese: v.japanese }]
  })
  return [...lesson.words.map((w) => ({ korean: w.korean, pronunciation: w.pronunciation, japanese: w.japanese })), ...fromVocab]
}

interface Pools {
  /** 習った母音・子音 */
  vowels: string[]
  consonants: string[]
  /** 習ったパッチムの代表音 */
  finals: string[]
  /** 教材に書かれた音節と読み（カタカナの選択肢に使う） */
  sounds: { korean: string; pronunciation: string }[]
  /** 習ったレッスンの言葉 */
  items: ReadingItem[]
}

function poolsOf(known: readonly HangulLesson[], vocabById: (id: string) => Vocab | undefined): Pools {
  const letters = known.flatMap((l) => l.letters.map((x) => x.jamo))
  return {
    vowels: letters.filter(isVowel),
    consonants: letters.filter((j) => !isVowel(j)),
    finals: known.flatMap((l) => l.finals.map((f) => f.sound)),
    sounds: known.flatMap((l) => [...l.letters.flatMap((x) => x.sounds), ...l.finals.flatMap((f) => f.sounds)]),
    items: known.flatMap((l) => readingItems(l, vocabById)),
  }
}

/** 音節の中の1つの字母（母音・初声・パッチム）を入れ替えた音節を作る */
function variants(target: string, part: 'medial' | 'initial' | 'final', replacements: readonly string[]): string[] {
  const s = splitSyllable(target)
  if (s === null) return []
  return replacements.flatMap((r) => {
    const v = part === 'medial' ? composeSyllable(s.initial, r, s.final) : part === 'initial' ? composeSyllable(r, s.medial, s.final) : composeSyllable(s.initial, s.medial, r)
    return v === null || v === target ? [] : [v]
  })
}

function listenQuestion(korean: string, tiers: readonly (readonly string[])[], random: Random): HangulQuestion | null {
  const wrong = distractorsFrom(korean, tiers, random)
  return wrong.length === 0 ? null : { kind: 'listen', korean, options: shuffle([korean, ...wrong], random) }
}

function readingQuestion(korean: string, answer: string, preferred: readonly string[], others: readonly string[], random: Random): HangulQuestion | null {
  const wrong = distractors(answer, preferred, others, random)
  return wrong.length === 0 ? null : { kind: 'reading', korean, answer, options: shuffle([answer, ...wrong], random) }
}

function itemQuestions(item: ReadingItem, own: readonly ReadingItem[], pools: Pools, random: Random): (HangulQuestion | null)[] {
  const sameLesson = own.filter((o) => o !== item)
  const questions: (HangulQuestion | null)[] = [
    readingQuestion(item.korean, item.pronunciation, sameLesson.map((o) => o.pronunciation), pools.items.map((o) => o.pronunciation), random),
  ]
  const wrongMeanings = distractors(item.japanese, sameLesson.map((o) => o.japanese), pools.items.map((o) => o.japanese), random)
  if (wrongMeanings.length > 0) {
    questions.push({ kind: 'meaning', korean: item.korean, reading: item.pronunciation, answer: item.japanese, options: shuffle([item.japanese, ...wrongMeanings], random) })
  }
  const syllables = [...item.korean].filter((c) => splitSyllable(c) !== null).length
  if (syllables <= BUILD_MAX_SYLLABLES && !/\s/.test(item.korean.trim())) {
    questions.push({ kind: 'build', korean: item.korean, reading: item.pronunciation })
  }
  return questions
}

/** レッスンの問題の候補（すべて）。audio が false なら、聞いて選ぶ問題は作らない */
export function questionCandidates(lesson: HangulLesson, known: readonly HangulLesson[], vocabById: (id: string) => Vocab | undefined, audio: boolean, random: Random): HangulQuestion[] {
  const pools = poolsOf(known, vocabById)
  const candidates: (HangulQuestion | null)[] = []
  const ownSounds = [...lesson.letters.flatMap((l) => l.sounds), ...lesson.finals.flatMap((f) => f.sounds)]
  const kanaOptions = (korean: string, answer: string) =>
    readingQuestion(
      korean,
      answer,
      ownSounds.map((s) => s.pronunciation),
      pools.sounds.map((s) => s.pronunciation),
      random,
    )

  for (const letter of lesson.letters) {
    const sound = pickOne(letter.sounds, random)
    if (sound === undefined) continue
    if (audio) {
      const ownLetters = lesson.letters.map((l) => l.jamo).filter((j) => j !== letter.jamo && isVowel(j) === isVowel(letter.jamo))
      const confusable = (letter.confusableWith ?? []).filter((j) => pools.vowels.includes(j) || pools.consonants.includes(j))
      const all = isVowel(letter.jamo) ? pools.vowels : pools.consonants
      const part = isVowel(letter.jamo) ? 'medial' : 'initial'
      const tiers = [variants(sound.korean, part, confusable), variants(sound.korean, part, ownLetters), variants(sound.korean, part, all)]
      candidates.push(listenQuestion(sound.korean, tiers, random))
    }
    candidates.push(kanaOptions(sound.korean, sound.pronunciation))
    candidates.push({ kind: 'build', korean: sound.korean, reading: sound.pronunciation })
  }

  for (const group of lesson.finals) {
    const sound = pickOne(group.sounds, random)
    if (sound === undefined) continue
    if (audio) {
      const own = lesson.finals.map((f) => f.sound).filter((f) => f !== group.sound)
      candidates.push(listenQuestion(sound.korean, [variants(sound.korean, 'final', own), variants(sound.korean, 'final', pools.finals)], random))
    }
    candidates.push(kanaOptions(sound.korean, sound.pronunciation))
    candidates.push({ kind: 'build', korean: sound.korean, reading: sound.pronunciation })
  }

  // 音の変化：発音どおりの形を選ぶ・カタカナの読みを選ぶ・聞いてつづりを選ぶ（計画 Q12。どの変化かを選ぶ問題は出さない）
  for (const rule of lesson.rules) {
    for (const ex of rule.examples) {
      const others = lesson.rules.flatMap((r) => r.examples).filter((e) => e !== ex)
      // 書いたとおりの形（発音が変わらないと思った場合）を、いちばんまぎらわしい選択肢にする
      const wrong = distractors(ex.spoken, ex.korean === ex.spoken ? [] : [ex.korean], others.map((e) => e.spoken), random)
      if (wrong.length > 0) candidates.push({ kind: 'spoken', korean: ex.korean, reading: ex.pronunciation, answer: ex.spoken, options: shuffle([ex.spoken, ...wrong], random) })
      candidates.push(readingQuestion(ex.korean, ex.pronunciation, others.map((e) => e.pronunciation), [], random))
      if (audio) {
        // 聞こえたとおりに書いた形（으막 など）を、いちばんまぎらわしい選択肢にする
        const wrongSpelling = distractors(ex.korean, ex.korean === ex.spoken ? [] : [ex.spoken], others.map((e) => e.korean), random)
        if (wrongSpelling.length > 0) candidates.push({ kind: 'listenSpelling', korean: ex.korean, options: shuffle([ex.korean, ...wrongSpelling], random) })
      }
    }
  }

  const own = readingItems(lesson, vocabById)
  for (const item of own) candidates.push(...itemQuestions(item, own, pools, random))

  return candidates.filter((q) => q !== null)
}

/**
 * 小テストの問題を count 問選ぶ。問題の種類がかたよらないよう、種類ごとに順番に1問ずつ選び、最後に並べ替える。
 * 候補が count 問より少なければ、あるだけ出す。
 */
export function buildQuiz(
  lesson: HangulLesson,
  allLessons: readonly HangulLesson[],
  vocabById: (id: string) => Vocab | undefined,
  options: { count: number; audio: boolean; random: Random },
): HangulQuestion[] {
  const { count, audio, random } = options
  const candidates = questionCandidates(lesson, lessonsUpTo(allLessons, lesson), vocabById, audio, random)
  const groups = new Map<HangulQuestionKind, HangulQuestion[]>()
  for (const q of shuffle(candidates, random)) groups.set(q.kind, [...(groups.get(q.kind) ?? []), q])
  const picked: HangulQuestion[] = []
  const kinds = shuffle([...groups.keys()], random)
  while (picked.length < count && kinds.some((k) => (groups.get(k)?.length ?? 0) > 0)) {
    for (const k of kinds) {
      if (picked.length >= count) break
      const q = groups.get(k)?.shift()
      if (q !== undefined) picked.push(q)
    }
  }
  return shuffle(picked, random)
}

/** 問題の正解（組み立てる問題は組み立てる文字） */
export function questionAnswer(q: HangulQuestion): string {
  switch (q.kind) {
    case 'listen':
    case 'listenSpelling':
    case 'build':
      return q.korean
    case 'reading':
    case 'meaning':
    case 'spoken':
      return q.answer
  }
}

/** 答えが正しいか。組み立てる問題は、空白・全角半角などの違いを無視して比べる */
export function isCorrectAnswer(q: HangulQuestion, given: string): boolean {
  if (q.kind === 'build') return normalizeAnswer(given).replace(/ /g, '') === normalizeAnswer(q.korean).replace(/ /g, '')
  return given === questionAnswer(q)
}

/** 小テストの点（0〜100）と合否 */
export function quizScore(correct: number, total: number, passPercent: number): { score: number; passed: boolean } {
  if (total <= 0) return { score: 0, passed: false }
  return { score: Math.round((correct * 100) / total), passed: correct * 100 >= passPercent * total }
}
