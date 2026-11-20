// 復習・練習・ドリル・章末テストの問題を、教材から作る（GAME_SPEC 4-2・4-3・4-4・4-9）。
// 1つの問題のもと（単語・文法・会話の往復・ドリルの問題）から、使える問題の形を集め、1つを選ぶ。
// 乱数は引数で受け取る（テストで同じ問題を作れるように）。

import type { Conversation, ConversationLine, ConversationTurn, DrillItem, Grammar, GrammarExample, Vocab } from '../../data/types'
import { shuffle, type Random } from '../hangul/quiz'
import { normalizeAnswer } from '../judge/judgeAnswer'
import { parseReviewKey } from '../review/review'

/** 問題に出す韓国語（読みと意味つき） */
export interface Phrase {
  korean: string
  /** 読み（カタカナ。ない場合は null） */
  pronunciation: string | null
  japanese: string
}

/** 問題で見せるもの */
export type Prompt =
  /** 韓国語を見せる（読み上げボタンつき） */
  | { kind: 'korean'; phrase: Phrase }
  /** 日本語を見せる。hint は添えるひとこと（例：固有数詞で） */
  | { kind: 'japanese'; text: string; hint: string | null }
  /** 聞かせる（答えた後に文字を見せる） */
  | { kind: 'audio'; phrase: Phrase }
  /** 穴のあいた韓国語の文と、その日本語 */
  | { kind: 'blank'; before: string; after: string; japanese: string }
  /** 会話の場面：相手の台詞と「言うこと」 */
  | { kind: 'conversation'; character: string; lines: ConversationLine[]; task: string | null }

export interface ChoiceOption {
  text: string
  /** 読み（韓国語の選択肢だけ。ない場合は null） */
  reading: string | null
  lang: 'ko' | 'ja'
}

/** 答え方 */
export type QuestionBody =
  /** 選ぶ。answers のどれかを選べば正解 */
  | { type: 'choose'; options: ChoiceOption[]; answers: string[] }
  /** 札を並べ替える。joiner で札をつなげたものが answer になれば正解 */
  | { type: 'arrange'; tiles: string[]; joiner: '' | ' '; answer: string }
  /** 韓国語を書く。rejectDigits なら、数字で書いた答えを正解にしない（数字の読み方を書く問題） */
  | { type: 'write'; answers: string[]; rejectDigits: boolean }
  /** 数字（算用数字）を書く */
  | { type: 'number'; digits: string }

/** 問題の形（同じ回で形がかたよらないようにするため・テストのため） */
export type QuestionForm =
  | 'koJa'
  | 'jaKo'
  | 'listen'
  | 'arrange'
  | 'blank'
  | 'write'
  | 'number'
  | 'numberListen'
  | 'turnChoose'
  | 'turnWrite'
  | 'grammarBlank'
  | 'grammarArrange'
  | 'grammarWrite'

export interface PracticeQuestion {
  /** 復習のキー（word:vocab_001 など） */
  key: string
  form: QuestionForm
  /** フリガナの表示を決める章 */
  chapter: number
  /** 問題文（例：この言葉の意味を選んでください） */
  heading: string
  prompt: Prompt
  body: QuestionBody
  /** 答えた後に見せる正解 */
  model: Phrase
}

export interface QuestionOptions {
  /** 読み上げが使えるか（聞く問題を作るか） */
  audio: boolean
  random: Random
  /** フリガナの表示を決める章（省略したら教材の章、それもなければ1） */
  chapter?: number
}

/** 選択肢の数（正解を含む） */
const OPTION_COUNT = 3
/** 文字の並べ替えに使う言葉の長さ（音節） */
const ARRANGE_SYLLABLES = { min: 2, max: 6 }
/** 語の並べ替えに使う例文の長さ（語） */
const ARRANGE_WORDS = { min: 3, max: 8 }
/** 会話の場面で見せる相手の台詞の数（最後から） */
const CONTEXT_LINES = 2

const HANGUL_SYLLABLE = /^[가-힣]$/

// ---------- 部品 ----------

/** 正解と重ならない選択肢を、preferred → others の順に選ぶ */
function pickDistractors<T>(answer: T, key: (t: T) => string, preferred: readonly T[], others: readonly T[], random: Random, count = OPTION_COUNT - 1): T[] {
  const used = new Set([key(answer)])
  const result: T[] = []
  for (const pool of [preferred, others]) {
    for (const c of shuffle(pool, random)) {
      if (result.length >= count) return result
      if (used.has(key(c))) continue
      used.add(key(c))
      result.push(c)
    }
  }
  return result
}

function koOption(p: { korean: string; pronunciation: string | null }): ChoiceOption {
  return { text: p.korean, reading: p.pronunciation, lang: 'ko' }
}

function jaOption(text: string): ChoiceOption {
  return { text, reading: null, lang: 'ja' }
}

/** 並べ替えた札が、元の順のままにならないようにする（並べ替えても同じなら null） */
function shuffledTiles(tiles: readonly string[], random: Random): string[] | null {
  const original = tiles.join('\u0000')
  for (let i = 0; i < 6; i++) {
    const t = shuffle(tiles, random)
    if (t.join('\u0000') !== original) return t
  }
  return null
}

function pick<T>(items: readonly T[], random: Random): T | undefined {
  return items[Math.floor(random() * items.length)]
}

/** 文字の並べ替えの札（空白・句読点のない2〜6音節の言葉だけ） */
function syllableTiles(korean: string): string[] | null {
  const chars = [...normalizeAnswer(korean)]
  if (chars.length < ARRANGE_SYLLABLES.min || chars.length > ARRANGE_SYLLABLES.max) return null
  return chars.every((c) => HANGUL_SYLLABLE.test(c)) ? chars : null
}

/** 語の並べ替えの札（句読点を除いた3〜8語の文だけ） */
function wordTiles(korean: string): string[] | null {
  const words = normalizeAnswer(korean).split(' ')
  return words.length >= ARRANGE_WORDS.min && words.length <= ARRANGE_WORDS.max ? words : null
}

/** text の中で part がちょうど1回だけ出てくるなら、前後に分ける */
function splitOnce(text: string, part: string): { before: string; after: string } | null {
  const at = text.indexOf(part)
  if (part === '' || at < 0 || text.indexOf(part, at + 1) >= 0 || part === text) return null
  return { before: text.slice(0, at), after: text.slice(at + part.length) }
}

// ---------- 単語 ----------

function vocabPhrase(v: Vocab): Phrase {
  return { korean: v.korean, pronunciation: v.pronunciation, japanese: v.japanese }
}

/** 単語の問題の候補（使える形すべて） */
export function wordQuestions(v: Vocab, pool: readonly Vocab[], options: QuestionOptions): PracticeQuestion[] {
  const { random, audio } = options
  const chapter = options.chapter ?? 1
  const key = `word:${v.id}`
  const model = vocabPhrase(v)
  // 同じ意味の言葉（감사합니다 と 고맙습니다 など）は、まぎらわしい選択肢に使わず、書く問題では正解にする
  const synonyms = pool.filter((o) => o.id !== v.id && o.japanese === v.japanese)
  const others = pool.filter((o) => o.id !== v.id && o.japanese !== v.japanese)
  const sameGenre = others.filter((o) => o.genre === v.genre)
  const base = { key, chapter, model }
  const questions: PracticeQuestion[] = []

  const wrongMeanings = pickDistractors(v, (o) => o.japanese, sameGenre, others, random)
  if (wrongMeanings.length > 0) {
    questions.push({
      ...base,
      form: 'koJa',
      heading: 'この言葉の意味を選んでください',
      prompt: { kind: 'korean', phrase: model },
      body: { type: 'choose', options: shuffle([v, ...wrongMeanings], random).map((o) => jaOption(o.japanese)), answers: [v.japanese] },
    })
  }
  const wrongWords = pickDistractors(v, (o) => o.korean, sameGenre, others, random)
  if (wrongWords.length > 0) {
    const koOptions = shuffle([v, ...wrongWords], random).map((o) => koOption(o))
    questions.push({ ...base, form: 'jaKo', heading: '韓国語で何と言いますか', prompt: { kind: 'japanese', text: v.japanese, hint: null }, body: { type: 'choose', options: koOptions, answers: [v.korean] } })
    if (audio) {
      questions.push({ ...base, form: 'listen', heading: '聞こえた言葉を選んでください', prompt: { kind: 'audio', phrase: model }, body: { type: 'choose', options: koOptions, answers: [v.korean] } })
    }
  }
  const tiles = syllableTiles(v.korean)
  const shuffled = tiles === null ? null : shuffledTiles(tiles, random)
  if (tiles !== null && shuffled !== null) {
    questions.push({ ...base, form: 'arrange', heading: '文字を並べて、言葉を作ってください', prompt: { kind: 'japanese', text: v.japanese, hint: null }, body: { type: 'arrange', tiles: shuffled, joiner: '', answer: tiles.join('') } })
  }
  const split = v.example === undefined ? null : splitOnce(v.example, v.korean)
  if (split !== null && wrongWords.length > 0) {
    const blankOptions = shuffle([v, ...wrongWords], random).map((o) => koOption({ korean: o.korean, pronunciation: null }))
    questions.push({
      ...base,
      form: 'blank',
      heading: '（　）に入る言葉を選んでください',
      prompt: { kind: 'blank', ...split, japanese: v.exampleJapanese ?? v.japanese },
      body: { type: 'choose', options: blankOptions, answers: [v.korean] },
    })
  }
  const answers = [v, ...synonyms].flatMap((o) => [o.korean, ...(o.alternatives ?? [])])
  questions.push({ ...base, form: 'write', heading: '韓国語で書いてみましょう', prompt: { kind: 'japanese', text: v.japanese, hint: null }, body: { type: 'write', answers, rejectDigits: false } })
  return questions
}

// ---------- 文法 ----------

function examplePhrase(ex: GrammarExample): Phrase {
  return { korean: ex.korean, pronunciation: ex.pronunciation, japanese: ex.japanese }
}

/** 文法の問題の候補（例文ごと、使える形すべて） */
export function grammarQuestions(g: Grammar, options: QuestionOptions): PracticeQuestion[] {
  const { random } = options
  const chapter = options.chapter ?? 1
  const key = `grammar:${g.id}`
  const hint = g.title
  return g.examples.flatMap((ex): PracticeQuestion[] => {
    const base = { key, chapter, model: examplePhrase(ex) }
    const result: PracticeQuestion[] = []
    const split = ex.blank === undefined ? null : splitOnce(ex.korean, ex.blank)
    if (split !== null && ex.blank !== undefined && ex.blankWrong !== undefined && ex.blankWrong.length > 0) {
      const opts = shuffle([ex.blank, ...ex.blankWrong], random).map((t) => koOption({ korean: t, pronunciation: null }))
      result.push({ ...base, form: 'grammarBlank', heading: '（　）に入るものを選んでください', prompt: { kind: 'blank', ...split, japanese: ex.japanese }, body: { type: 'choose', options: opts, answers: [ex.blank] } })
    }
    const tiles = wordTiles(ex.korean)
    const shuffled = tiles === null ? null : shuffledTiles(tiles, random)
    if (tiles !== null && shuffled !== null) {
      result.push({ ...base, form: 'grammarArrange', heading: '語を並べて、文を作ってください', prompt: { kind: 'japanese', text: ex.japanese, hint }, body: { type: 'arrange', tiles: shuffled, joiner: ' ', answer: tiles.join(' ') } })
    }
    result.push({ ...base, form: 'grammarWrite', heading: '韓国語で書いてみましょう', prompt: { kind: 'japanese', text: ex.japanese, hint }, body: { type: 'write', answers: [ex.korean, ...(ex.alternatives ?? [])], rejectDigits: false } })
    return result
  })
}

// ---------- 会話の往復 ----------

/** 問題の往復か（選択肢があり、選択の往復でない） */
export function isQuestionTurn(turn: ConversationTurn | undefined): turn is ConversationTurn & { choices: NonNullable<ConversationTurn['choices']> } {
  return turn?.choices !== undefined && turn.kind !== 'decision'
}

/** 往復の前に見せる相手の台詞（台詞を省略した往復では、前の往復の反応） */
function turnContext(conversation: Conversation, index: number): ConversationLine[] {
  const turn = conversation.turns[index]
  if (turn === undefined) return []
  if (turn.lines.length > 0) return turn.lines.slice(-CONTEXT_LINES)
  const prev = conversation.turns[index - 1]
  const prevChoice = prev?.choices?.find((c) => c.correct) ?? prev?.choices?.[0]
  return (prevChoice?.reply ?? []).slice(-CONTEXT_LINES)
}

/** 会話の往復の問題の候補（選ぶ・書く） */
export function turnQuestions(conversation: Conversation, index: number, options: QuestionOptions): PracticeQuestion[] {
  const turn = conversation.turns[index]
  if (!isQuestionTurn(turn)) return []
  const correct = turn.choices.filter((c) => c.correct)
  const first = correct[0]
  if (first === undefined) return []
  const chapter = options.chapter ?? conversation.chapter
  const task = turn.task ?? null
  const prompt: Prompt = { kind: 'conversation', character: conversation.character, lines: turnContext(conversation, index), task }
  const base = { key: `turn:${conversation.id}#${index}`, chapter, prompt }
  const questions: PracticeQuestion[] = [
    {
      ...base,
      form: 'turnChoose',
      heading: task === null ? '返事を選んでください' : '何と言いますか。選んでください',
      body: { type: 'choose', options: shuffle(turn.choices, options.random).map((c) => koOption(c)), answers: correct.map((c) => c.korean) },
      model: { korean: first.korean, pronunciation: first.pronunciation, japanese: first.japanese },
    },
  ]
  const free = turn.freeAnswer
  const model = free?.answers[0]
  if (free !== undefined && model !== undefined) {
    const same = turn.choices.find((c) => normalizeAnswer(c.korean) === normalizeAnswer(model))
    questions.push({
      ...base,
      form: 'turnWrite',
      heading: `「${free.prompt}」を韓国語で書いてみましょう`,
      body: { type: 'write', answers: free.answers, rejectDigits: false },
      model: { korean: model, pronunciation: same?.pronunciation ?? null, japanese: free.prompt },
    })
  }
  return questions
}

// ---------- ドリル・章末テストの問題 ----------

function drillPhrase(item: DrillItem): Phrase {
  return { korean: item.korean, pronunciation: item.pronunciation, japanese: item.japanese }
}

/** ドリルの問題の候補。siblings は同じドリル（テスト）の問題（選択肢に使う） */
export function drillQuestions(item: DrillItem, siblings: readonly DrillItem[], options: QuestionOptions): PracticeQuestion[] {
  const { random, audio } = options
  const chapter = options.chapter ?? 1
  const model = drillPhrase(item)
  const base = { key: `drill:${item.id}`, chapter, model }
  const hint = item.hintJa ?? null
  // 日本語を見て韓国語を書く。数字の問題では、数字で書いた答えを正解にしない（読み方を書く練習のため）
  const write: PracticeQuestion = {
    ...base,
    form: 'write',
    heading: '韓国語で書いてみましょう',
    prompt: { kind: 'japanese', text: item.japanese, hint },
    body: { type: 'write', answers: [item.korean, ...(item.alternatives ?? [])], rejectDigits: item.digits !== undefined },
  }
  if (item.digits !== undefined) {
    // 数字の問題は選択肢を出さない（選択肢がヒントになるため。GAME_SPEC 4-2）
    const questions: PracticeQuestion[] = [{ ...base, form: 'number', heading: '数字で書いてください', prompt: { kind: 'korean', phrase: model }, body: { type: 'number', digits: item.digits } }, write]
    if (audio) questions.push({ ...base, form: 'numberListen', heading: '聞いて、数字で書いてください', prompt: { kind: 'audio', phrase: model }, body: { type: 'number', digits: item.digits } })
    return questions
  }
  // 同じ意味の問題は、まぎらわしい選択肢に使わない
  const others = siblings.filter((s) => s.id !== item.id && s.japanese !== item.japanese)
  const questions: PracticeQuestion[] = [write]
  const wrongMeanings = pickDistractors(item, (o) => o.japanese, others, [], random)
  if (wrongMeanings.length > 0) {
    questions.push({
      ...base,
      form: 'koJa',
      heading: 'この言葉の意味を選んでください',
      prompt: { kind: 'korean', phrase: model },
      body: { type: 'choose', options: shuffle([item, ...wrongMeanings], random).map((o) => jaOption(o.japanese)), answers: [item.japanese] },
    })
  }
  const wrongWords = pickDistractors(item, (o) => o.korean, others, [], random)
  if (wrongWords.length > 0) {
    const koOptions = shuffle([item, ...wrongWords], random).map((o) => koOption(o))
    const answers = [item.korean]
    questions.push({ ...base, form: 'jaKo', heading: '韓国語で何と言いますか', prompt: { kind: 'japanese', text: item.japanese, hint }, body: { type: 'choose', options: koOptions, answers } })
    if (audio) questions.push({ ...base, form: 'listen', heading: '聞こえた言葉を選んでください', prompt: { kind: 'audio', phrase: model }, body: { type: 'choose', options: koOptions, answers } })
  }
  return questions
}

// ---------- 復習のキーから問題を作る ----------

export interface PracticeSources {
  vocabulary: readonly Vocab[]
  grammar: readonly Grammar[]
  conversations: readonly Conversation[]
  /** ドリル・章末テストの問題（グループごと。同じグループの問題を選択肢に使う） */
  drillGroups: readonly (readonly DrillItem[])[]
}

export interface PracticeIndex {
  /** 問題を作れるか（教材が今もあるか） */
  exists: (key: string) => boolean
  /** 使える形の問題をすべて作る（作れなければ []） */
  candidates: (key: string, options: QuestionOptions) => PracticeQuestion[]
  /** 問題を1つ作る（形はランダム。avoid の形はなるべく避ける） */
  question: (key: string, options: QuestionOptions, avoid?: ReadonlySet<QuestionForm>) => PracticeQuestion | null
}

export function createPracticeIndex(sources: PracticeSources): PracticeIndex {
  const vocab = new Map(sources.vocabulary.map((v) => [v.id, v]))
  const grammar = new Map(sources.grammar.map((g) => [g.id, g]))
  const conversations = new Map(sources.conversations.map((c) => [c.id, c]))
  const drillItems = new Map<string, { item: DrillItem; group: readonly DrillItem[] }>()
  for (const group of sources.drillGroups) for (const item of group) drillItems.set(item.id, { item, group })

  function turnOf(id: string): { conversation: Conversation; index: number } | null {
    const hash = id.lastIndexOf('#')
    const conversation = conversations.get(id.slice(0, hash))
    const index = Number(id.slice(hash + 1))
    if (hash < 0 || conversation === undefined || !Number.isInteger(index)) return null
    return isQuestionTurn(conversation.turns[index]) ? { conversation, index } : null
  }

  function candidates(key: string, options: QuestionOptions): PracticeQuestion[] {
    const parsed = parseReviewKey(key)
    if (parsed === null) return []
    switch (parsed.kind) {
      case 'word': {
        const v = vocab.get(parsed.id)
        return v === undefined ? [] : wordQuestions(v, sources.vocabulary, options)
      }
      case 'grammar': {
        const g = grammar.get(parsed.id)
        return g === undefined ? [] : grammarQuestions(g, options)
      }
      case 'turn': {
        const t = turnOf(parsed.id)
        return t === null ? [] : turnQuestions(t.conversation, t.index, options)
      }
      case 'drill': {
        const d = drillItems.get(parsed.id)
        return d === undefined ? [] : drillQuestions(d.item, d.group, options)
      }
    }
  }

  function exists(key: string): boolean {
    const parsed = parseReviewKey(key)
    if (parsed === null) return false
    switch (parsed.kind) {
      case 'word':
        return vocab.has(parsed.id)
      case 'grammar':
        return (grammar.get(parsed.id)?.examples.length ?? 0) > 0
      case 'turn':
        return turnOf(parsed.id) !== null
      case 'drill':
        return drillItems.has(parsed.id)
    }
  }

  return {
    exists,
    candidates,
    question(key, options, avoid) {
      const all = candidates(key, options)
      const fresh = avoid === undefined ? all : all.filter((q) => !avoid.has(q.form))
      return pick(fresh.length > 0 ? fresh : all, options.random) ?? null
    },
  }
}

/**
 * キーの並びから、1回分の問題を作る。同じ形が続かないよう、直前の形はなるべく避ける。
 * chapterOf はフリガナの表示を決める章（覚えたときの章など）
 */
export function buildQuestions(index: PracticeIndex, keys: readonly string[], options: Omit<QuestionOptions, 'chapter'> & { chapterOf?: (key: string) => number | undefined }): PracticeQuestion[] {
  const result: PracticeQuestion[] = []
  for (const key of keys) {
    const prev = result.at(-1)
    const chapter = options.chapterOf?.(key)
    const q = index.question(key, { audio: options.audio, random: options.random, ...(chapter === undefined ? {} : { chapter }) }, prev === undefined ? undefined : new Set([prev.form]))
    if (q !== null) result.push(q)
  }
  return result
}
