// 教材データ・ゲームデータの検証。
// JSON は形が保証されないため unknown として受け取り、1項目ずつ確かめてから型付きのデータにする。
// 問題のあるデータは除外し、問題の一覧（ValidationIssue）を返す。例外は投げない。

import {
  COLUMN_BLOCK_TYPES,
  EVENT_STEP_TYPES,
  SCENE_BACKGROUNDS,
  EXPRESSIONS,
  HANGUL_LESSON_KINDS,
  ID_PATTERNS,
  PARTS_OF_SPEECH,
  PLAYER_SPEAKER_ID,
  VOCAB_GENRES,
  type Balance,
  type ChapterTest,
  type Character,
  type CharacterName,
  type Column,
  type ColumnBlock,
  type Conversation,
  type Drill,
  type DrillItem,
  type ConversationChoice,
  type ConversationLine,
  type ConversationTurn,
  type EventStep,
  type Expression,
  type FreeAnswer,
  type GameEvent,
  type Grammar,
  type GrammarExample,
  type HangulFinal,
  type HangulLesson,
  type HangulLessonKind,
  type HangulLetter,
  type HangulSound,
  type HangulWord,
  type ListeningOption,
  type ListeningSentence,
  type Location,
  type MapArea,
  type ValidationIssue,
  type SoundChangeExample,
  type SoundChangeRule,
  type Vocab,
} from './types'
import { normalizeAnswer } from '../learning/judge/judgeAnswer'
import {
  FINAL_CONSONANTS,
  LETTER_JAMO,
  REPRESENTATIVE_FINALS,
  containsIsolatedJamo,
  isVowel,
  splitSyllable,
  unlearnedJamo,
  type Syllable,
} from '../learning/hangul/jamo'

type Obj = Record<string, unknown>

interface FieldError {
  path: string
  message: string
}

/** 参照の確認に使う、読み込み済みのID */
export interface ReferenceContext {
  locationIds: ReadonlySet<string>
  characterIds: ReadonlySet<string>
  vocabularyIds: ReadonlySet<string>
  grammarIds: ReadonlySet<string>
  /** 会話ID → 施設ID */
  conversationLocations: ReadonlyMap<string, string>
  columnIds: ReadonlySet<string>
  /** 読み込めたイベントのID（前提の確認を終えたもの） */
  eventIds: ReadonlySet<string>
}

export function emptyReferenceContext(): ReferenceContext {
  return {
    locationIds: new Set(),
    characterIds: new Set(),
    vocabularyIds: new Set(),
    grammarIds: new Set(),
    conversationLocations: new Map(),
    columnIds: new Set(),
    eventIds: new Set(),
  }
}

export type ContentKind =
  | 'vocabulary'
  | 'grammar'
  | 'conversations'
  | 'columns'
  | 'events'
  | 'locations'
  | 'characters'
  | 'hangulLessons'
  | 'listening'
  | 'drills'
  | 'chapterTests'

const MAX_CHAPTER = 10

// ---------- 項目を確かめる小さな関数 ----------

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`
  return base === '' ? key : `${base}.${key}`
}

function checkKnownKeys(o: Obj, allowed: readonly string[], base: string, errs: FieldError[]): void {
  for (const key of Object.keys(o)) {
    if (!allowed.includes(key)) {
      errs.push({ path: joinPath(base, key), message: `知らない項目です（綴りの間違いかもしれません）。使える項目：${allowed.join(', ')}` })
    }
  }
}

function checkTextValue(v: unknown, path: string, errs: FieldError[]): string | undefined {
  if (typeof v !== 'string' || v.trim() === '') {
    errs.push({ path, message: '空でない文字列にしてください' })
    return undefined
  }
  if (v.normalize('NFC') !== v) {
    errs.push({ path, message: '文字がUnicode正規化（NFC）されていません。ハングルを字母に分けた形で書かないでください' })
    return undefined
  }
  return v
}

function text(o: Obj, key: string, base: string, errs: FieldError[]): string | undefined {
  const path = joinPath(base, key)
  if (o[key] === undefined) {
    errs.push({ path, message: '必須項目がありません' })
    return undefined
  }
  return checkTextValue(o[key], path, errs)
}

function optionalText(o: Obj, key: string, base: string, errs: FieldError[]): string | undefined {
  if (o[key] === undefined) return undefined
  return checkTextValue(o[key], joinPath(base, key), errs)
}

function textArray(
  o: Obj,
  key: string,
  base: string,
  errs: FieldError[],
  opts: { optional: boolean; min: number },
): string[] | undefined {
  const path = joinPath(base, key)
  const v = o[key]
  if (v === undefined) {
    if (!opts.optional) errs.push({ path, message: '必須項目がありません' })
    return undefined
  }
  if (!Array.isArray(v)) {
    errs.push({ path, message: '文字列の配列にしてください' })
    return undefined
  }
  if (v.length < opts.min) {
    errs.push({ path, message: `${opts.min}個以上入れてください` })
    return undefined
  }
  const result: string[] = []
  v.forEach((item: unknown, i) => {
    const s = checkTextValue(item, joinPath(path, i), errs)
    if (s !== undefined) result.push(s)
  })
  if (new Set(result).size !== result.length) {
    errs.push({ path, message: '同じ文字列が重複しています' })
  }
  return result
}

function bool(o: Obj, key: string, base: string, errs: FieldError[]): boolean | undefined {
  const path = joinPath(base, key)
  const v = o[key]
  if (v === undefined) {
    errs.push({ path, message: '必須項目がありません' })
    return undefined
  }
  if (typeof v !== 'boolean') {
    errs.push({ path, message: 'true か false にしてください（"true" のように引用符で囲まない）' })
    return undefined
  }
  return v
}

function integer(o: Obj, key: string, base: string, errs: FieldError[], min: number, max?: number): number | undefined {
  const path = joinPath(base, key)
  const v = o[key]
  if (v === undefined) {
    errs.push({ path, message: '必須項目がありません' })
    return undefined
  }
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || (max !== undefined && v > max)) {
    const range = max === undefined ? `${min}以上` : `${min}〜${max}`
    errs.push({ path, message: `${range}の整数にしてください（引用符で囲まない）` })
    return undefined
  }
  return v
}

function oneOf<T extends string>(o: Obj, key: string, base: string, errs: FieldError[], allowed: readonly T[]): T | undefined {
  const path = joinPath(base, key)
  const v = o[key]
  if (v === undefined) {
    errs.push({ path, message: '必須項目がありません' })
    return undefined
  }
  const found = allowed.find((a) => a === v)
  if (found === undefined) {
    errs.push({ path, message: `決められたキーのどれかにしてください：${allowed.join(', ')}` })
  }
  return found
}

function reference(o: Obj, key: string, base: string, errs: FieldError[], known: ReadonlySet<string>, label: string): string | undefined {
  const v = text(o, key, base, errs)
  if (v === undefined) return undefined
  if (!known.has(v)) {
    errs.push({ path: joinPath(base, key), message: `存在しない${label}です：${v}。使えるキー：${[...known].join(', ')}` })
    return undefined
  }
  return v
}

function objArray(o: Obj, key: string, base: string, errs: FieldError[], min: number): { value: Obj; path: string }[] | undefined {
  const path = joinPath(base, key)
  const v = o[key]
  if (v === undefined) {
    errs.push({ path, message: '必須項目がありません' })
    return undefined
  }
  if (!Array.isArray(v)) {
    errs.push({ path, message: '配列（[ ]）にしてください' })
    return undefined
  }
  if (v.length < min) {
    errs.push({ path, message: `${min}個以上入れてください` })
    return undefined
  }
  const result: { value: Obj; path: string }[] = []
  v.forEach((item: unknown, i) => {
    const itemPath = joinPath(path, i)
    if (isObj(item)) result.push({ value: item, path: itemPath })
    else errs.push({ path: itemPath, message: 'オブジェクト（{ }）にしてください' })
  })
  return result
}

// ---------- 読み（カタカナ）と日本語の文 ----------

const READING_PATTERN = /^[ァ-ヺー]+( [ァ-ヺー]+)*$/
const PUNCTUATION_ONLY = /^[\p{P}\p{S}]+$/u
const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/

/** 韓国語を空白で区切った数（句読点だけの区切りは数えない） */
export function koreanChunkCount(korean: string): number {
  return korean
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '' && !PUNCTUATION_ONLY.test(t)).length
}

/**
 * 読みの項目を確かめる。カタカナと半角スペースだけで、韓国語と区切りの数が一致すること。
 * korean が読めていない（undefined）ときは、区切りの数は確かめない。
 */
function reading(o: Obj, key: string, base: string, errs: FieldError[], korean: string | undefined): string | undefined {
  const v = text(o, key, base, errs)
  if (v === undefined) return undefined
  const path = joinPath(base, key)
  if (!READING_PATTERN.test(v)) {
    errs.push({ path, message: '読みはカタカナと半角スペースだけで書いてください（句読点・ひらがな・全角スペース、先頭や末尾の空白、続けた空白は使えません）' })
    return undefined
  }
  if (korean !== undefined) {
    const expected = koreanChunkCount(korean)
    const actual = v.split(' ').length
    if (expected !== actual) {
      errs.push({ path, message: `韓国語の区切り（${expected}個）と読みの区切り（${actual}個）の数が違います。韓国語と同じ位置で空白を入れてください` })
      return undefined
    }
  }
  return v
}

/** 日本語の文（案内文など）。韓国語を入れないルールなので、ハングルがあればエラー */
function japaneseText(o: Obj, key: string, base: string, errs: FieldError[]): string | undefined {
  const v = text(o, key, base, errs)
  if (v !== undefined && HANGUL.test(v)) {
    errs.push({ path: joinPath(base, key), message: '日本語の文にハングルは入れられません（韓国語が必要な場合は教材として依頼してください）' })
    return undefined
  }
  return v
}

function idList(o: Obj, key: string, base: string, errs: FieldError[], known: ReadonlySet<string>, label: string, optional: boolean): string[] | undefined {
  const list = textArray(o, key, base, errs, { optional, min: 0 })
  if (list === undefined) return undefined
  const path = joinPath(base, key)
  for (const id of list) {
    if (!known.has(id)) errs.push({ path, message: `存在しない${label}です：${id}` })
  }
  return list
}

function idField(o: Obj, pattern: RegExp, example: string, errs: FieldError[]): string | undefined {
  const v = text(o, 'id', '', errs)
  if (v === undefined) return undefined
  if (!pattern.test(v)) {
    errs.push({ path: 'id', message: `IDの形式が違います（例：${example}）` })
    return undefined
  }
  return v
}

// ---------- 1件ずつの検証 ----------

const VOCAB_KEYS = [
  'id',
  'korean',
  'alternatives',
  'pronunciation',
  'japanese',
  'partOfSpeech',
  'genre',
  'level',
  'example',
  'examplePronunciation',
  'exampleJapanese',
  'reviewed',
  'notes',
] as const

function parseVocab(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Vocab | undefined {
  if (o['category'] !== undefined && o['genre'] === undefined) {
    errs.push({ path: 'category', message: 'category は genre（ジャンル）に変わりました（GAME_SPEC v2.5）。キーの一覧は CONTENT_FORMAT.md の 10-2 を見てください' })
    return undefined
  }
  checkKnownKeys(o, VOCAB_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.vocabulary, 'vocab_001', errs)
  const korean = text(o, 'korean', '', errs)
  const alternatives = textArray(o, 'alternatives', '', errs, { optional: true, min: 1 })
  const pronunciation = reading(o, 'pronunciation', '', errs, korean)
  const japanese = text(o, 'japanese', '', errs)
  const partOfSpeech = oneOf(o, 'partOfSpeech', '', errs, PARTS_OF_SPEECH)
  const genre = oneOf(o, 'genre', '', errs, VOCAB_GENRES)
  const level = integer(o, 'level', '', errs, 1)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)

  // 例文は「韓国語・読み・日本語訳」の3つをそろえて書くか、そろえて省く
  const exampleKeys = ['example', 'examplePronunciation', 'exampleJapanese'] as const
  const present = exampleKeys.filter((k) => o[k] !== undefined)
  let example: string | undefined
  let examplePronunciation: string | undefined
  let exampleJapanese: string | undefined
  if (present.length > 0 && present.length < exampleKeys.length) {
    errs.push({ path: 'example', message: 'example・examplePronunciation・exampleJapanese は3つそろえて書くか、3つとも省いてください' })
  } else if (present.length === exampleKeys.length) {
    example = text(o, 'example', '', errs)
    examplePronunciation = reading(o, 'examplePronunciation', '', errs, example)
    exampleJapanese = text(o, 'exampleJapanese', '', errs)
  }
  if (korean !== undefined && alternatives?.includes(korean)) {
    errs.push({ path: 'alternatives', message: 'korean と同じ文字列は alternatives に入れないでください' })
  }

  if (
    errs.length > 0 ||
    id === undefined ||
    korean === undefined ||
    pronunciation === undefined ||
    japanese === undefined ||
    partOfSpeech === undefined ||
    genre === undefined ||
    level === undefined ||
    reviewed === undefined
  ) {
    return undefined
  }
  const vocab: Vocab = { id, korean, pronunciation, japanese, partOfSpeech, genre, level, reviewed }
  if (alternatives !== undefined) vocab.alternatives = alternatives
  if (example !== undefined && examplePronunciation !== undefined && exampleJapanese !== undefined) {
    vocab.example = example
    vocab.examplePronunciation = examplePronunciation
    vocab.exampleJapanese = exampleJapanese
  }
  if (notes !== undefined) vocab.notes = notes
  return vocab
}

const GRAMMAR_KEYS = ['id', 'title', 'level', 'explanation', 'connectionJa', 'examples', 'reviewed', 'notes'] as const
const GRAMMAR_EXAMPLE_KEYS = ['korean', 'pronunciation', 'japanese', 'alternatives', 'blank', 'blankWrong'] as const

/** 穴埋め問題（blank・blankWrong）。blank は korean の中に1回だけ含まれ、文全体ではないこと */
function parseBlank(value: Obj, path: string, korean: string | undefined, errs: FieldError[]): { blank: string; blankWrong: string[] } | undefined {
  const hasBlank = value['blank'] !== undefined
  const hasWrong = value['blankWrong'] !== undefined
  if (!hasBlank && !hasWrong) return undefined
  if (!hasBlank) {
    errs.push({ path: joinPath(path, 'blank'), message: 'blankWrong を書くときは blank（隠す部分）も書いてください' })
    return undefined
  }
  const blank = text(value, 'blank', path, errs)
  const blankWrong = textArray(value, 'blankWrong', path, errs, { optional: false, min: 1 })
  if (blank === undefined || blankWrong === undefined || korean === undefined) return undefined
  const count = korean.split(blank).length - 1
  if (count !== 1) {
    errs.push({
      path: joinPath(path, 'blank'),
      message: count === 0 ? `blank「${blank}」が korean の中にありません（そのままの形で書いてください）` : `blank「${blank}」が korean の中に${count}回あります。1回だけ出てくる部分にしてください`,
    })
    return undefined
  }
  if (normalizeAnswer(blank) === normalizeAnswer(korean)) {
    errs.push({ path: joinPath(path, 'blank'), message: '文全体は blank にできません。隠したい部分だけを書いてください' })
    return undefined
  }
  if (blankWrong.includes(blank)) {
    errs.push({ path: joinPath(path, 'blankWrong'), message: 'blank と同じ文字列は blankWrong に入れないでください' })
    return undefined
  }
  return { blank, blankWrong }
}

function parseGrammar(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Grammar | undefined {
  checkKnownKeys(o, GRAMMAR_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.grammar, 'grammar_001', errs)
  const title = text(o, 'title', '', errs)
  const level = integer(o, 'level', '', errs, 1)
  const explanation = text(o, 'explanation', '', errs)
  const connectionJa = optionalText(o, 'connectionJa', '', errs)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)

  const examples: GrammarExample[] = []
  for (const { value, path } of objArray(o, 'examples', '', errs, 1) ?? []) {
    checkKnownKeys(value, GRAMMAR_EXAMPLE_KEYS, path, errs)
    const korean = text(value, 'korean', path, errs)
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    const japanese = text(value, 'japanese', path, errs)
    const alternatives = textArray(value, 'alternatives', path, errs, { optional: true, min: 1 })
    if (korean !== undefined && alternatives?.includes(korean)) {
      errs.push({ path: joinPath(path, 'alternatives'), message: 'korean と同じ文字列は alternatives に入れないでください' })
    }
    const blank = parseBlank(value, path, korean, errs)
    if (korean === undefined || pronunciation === undefined || japanese === undefined) continue
    const ex: GrammarExample = { korean, pronunciation, japanese }
    if (alternatives !== undefined) ex.alternatives = alternatives
    if (blank !== undefined) {
      ex.blank = blank.blank
      ex.blankWrong = blank.blankWrong
    }
    examples.push(ex)
  }

  if (errs.length > 0 || id === undefined || title === undefined || level === undefined || explanation === undefined || reviewed === undefined) {
    return undefined
  }
  const grammar: Grammar = { id, title, level, explanation, examples, reviewed }
  if (connectionJa !== undefined) grammar.connectionJa = connectionJa
  if (notes !== undefined) grammar.notes = notes
  return grammar
}

const CONVERSATION_KEYS = ['id', 'chapter', 'location', 'character', 'turns', 'reviewed', 'notes'] as const
const TURN_KEYS = ['kind', 'task', 'lines', 'choices', 'freeAnswer'] as const

/**
 * 往復の種類。
 * - question：問題（正解が1つ。task が必須）
 * - decision：選択（正解・不正解を付けない）
 * - legacy：task のない問題の往復。1日目の会話が新しい形で届くまでの間だけ、古い形（正解が複数あってよい）として読み込む
 */
type TurnMode = 'question' | 'decision' | 'legacy'
const LINE_KEYS = ['speaker', 'korean', 'pronunciation', 'japanese', 'expression'] as const
const CHOICE_KEYS = ['korean', 'pronunciation', 'japanese', 'correct', 'reply'] as const
const FREE_ANSWER_KEYS = ['prompt', 'answers', 'reply'] as const

/** 台詞の配列（lines・reply）。min 個以上 */
function parseLines(o: Obj, key: string, base: string, ctx: ReferenceContext, errs: FieldError[], min: number): ConversationLine[] | undefined {
  const items = objArray(o, key, base, errs, min)
  if (items === undefined) return undefined
  const speakerIds = new Set([...ctx.characterIds, PLAYER_SPEAKER_ID])
  const lines: ConversationLine[] = []
  for (const { value, path } of items) {
    checkKnownKeys(value, LINE_KEYS, path, errs)
    const speaker = reference(value, 'speaker', path, errs, speakerIds, '話者ID')
    const korean = text(value, 'korean', path, errs)
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    const japanese = text(value, 'japanese', path, errs)
    let expression: Expression | undefined
    if (value['expression'] !== undefined) {
      expression = oneOf(value, 'expression', path, errs, EXPRESSIONS)
      if (speaker === PLAYER_SPEAKER_ID) {
        errs.push({ path: joinPath(path, 'expression'), message: '主人公（player）の台詞には expression を付けられません（主人公の立ち絵はありません）' })
      }
    }
    if (speaker !== undefined && korean !== undefined && pronunciation !== undefined && japanese !== undefined) {
      const line: ConversationLine = { speaker, korean, pronunciation, japanese }
      if (expression !== undefined) line.expression = expression
      lines.push(line)
    }
  }
  return lines
}

function optionalLines(o: Obj, key: string, base: string, ctx: ReferenceContext, errs: FieldError[]): ConversationLine[] | undefined {
  return o[key] === undefined ? undefined : parseLines(o, key, base, ctx, errs, 1)
}

function parseChoices(o: Obj, base: string, ctx: ReferenceContext, errs: FieldError[], mode: TurnMode): ConversationChoice[] | undefined {
  const choiceItems = objArray(o, 'choices', base, errs, mode === 'decision' ? 2 : 1)
  if (choiceItems === undefined) return undefined
  const path = joinPath(base, 'choices')
  const choices: ConversationChoice[] = []
  for (const { value, path: itemPath } of choiceItems) {
    checkKnownKeys(value, CHOICE_KEYS, itemPath, errs)
    const korean = text(value, 'korean', itemPath, errs)
    const pronunciation = reading(value, 'pronunciation', itemPath, errs, korean)
    const japanese = text(value, 'japanese', itemPath, errs)
    let correct: boolean | undefined = false
    if (mode === 'decision') {
      if (value['correct'] !== undefined) {
        errs.push({ path: joinPath(itemPath, 'correct'), message: '選択の往復（"kind": "decision"）では correct を書かないでください（正解・不正解を付けません）' })
      }
    } else {
      correct = bool(value, 'correct', itemPath, errs)
    }
    const reply = optionalLines(value, 'reply', itemPath, ctx, errs)
    if (value['reply'] === undefined) {
      if (mode === 'decision') {
        errs.push({ path: joinPath(itemPath, 'reply'), message: '選択の往復では、選択肢ごとに相手の反応（reply）を書いてください' })
      } else if (mode === 'question' && correct === false) {
        errs.push({ path: joinPath(itemPath, 'reply'), message: '不正解の選択肢には、相手の反応（reply）を書いてください（困った顔をする、聞き返す など。GAME_SPEC 4-4）' })
      }
    }
    if (korean !== undefined && pronunciation !== undefined && japanese !== undefined && correct !== undefined) {
      const choice: ConversationChoice = { korean, pronunciation, japanese, correct }
      if (reply !== undefined) choice.reply = reply
      choices.push(choice)
    }
  }
  const allChoicesBoolean = choiceItems.every(({ value }) => typeof value['correct'] === 'boolean')
  const correctCount = choiceItems.filter(({ value }) => value['correct'] === true).length
  if (mode === 'question' && allChoicesBoolean && correctCount !== 1) {
    errs.push({ path, message: `問題の往復では、"correct": true の選択肢をちょうど1つにしてください（今は${correctCount}つ）。話が変わるだけの場面なら "kind": "decision" にします` })
  }
  if (mode === 'legacy' && choiceItems.length > 0 && allChoicesBoolean && correctCount === 0) {
    errs.push({ path, message: '"correct": true の選択肢を1つ以上入れてください' })
  }
  if (new Set(choices.map((c) => c.korean)).size !== choices.length) {
    errs.push({ path, message: '同じ韓国語の選択肢が重複しています' })
  }
  return choices
}

function parseFreeAnswer(o: Obj, base: string, ctx: ReferenceContext, errs: FieldError[]): FreeAnswer | undefined {
  const raw = o['freeAnswer']
  const path = joinPath(base, 'freeAnswer')
  if (raw === undefined) return undefined
  if (!isObj(raw)) {
    errs.push({ path, message: 'オブジェクト（{ }）にしてください' })
    return undefined
  }
  checkKnownKeys(raw, FREE_ANSWER_KEYS, path, errs)
  const prompt = text(raw, 'prompt', path, errs)
  const answers = textArray(raw, 'answers', path, errs, { optional: false, min: 1 })
  const reply = optionalLines(raw, 'reply', path, ctx, errs)
  if (prompt === undefined || answers === undefined) return undefined
  const free: FreeAnswer = { prompt, answers }
  if (reply !== undefined) free.reply = reply
  return free
}

function parseTurn(value: Obj, path: string, index: number, isLast: boolean, ctx: ReferenceContext, errs: FieldError[]): ConversationTurn | undefined {
  checkKnownKeys(value, TURN_KEYS, path, errs)
  const hasChoices = value['choices'] !== undefined
  let decision = false
  if (value['kind'] !== undefined) {
    if (value['kind'] === 'decision') decision = true
    else errs.push({ path: joinPath(path, 'kind'), message: 'kind に書けるのは "decision"（選択の往復）だけです。問題の往復では kind を省きます' })
  }
  const task = value['task'] === undefined ? undefined : japaneseText(value, 'task', path, errs)
  const mode: TurnMode = decision ? 'decision' : value['task'] === undefined ? 'legacy' : 'question'
  // 最初の往復と、返事のない往復（締めの台詞）は、台詞が1つ以上必要
  const linesRequired = index === 0 || !hasChoices
  const lines = value['lines'] === undefined && !linesRequired ? [] : parseLines(value, 'lines', path, ctx, errs, linesRequired ? 1 : 0)
  const choices = hasChoices ? parseChoices(value, path, ctx, errs, mode) : undefined
  const freeAnswer = parseFreeAnswer(value, path, ctx, errs)
  if (!hasChoices) {
    if (!isLast) errs.push({ path: joinPath(path, 'choices'), message: '返事（choices）のない往復は、最後の往復（締めの台詞）にしか使えません' })
    if (value['freeAnswer'] !== undefined) errs.push({ path: joinPath(path, 'freeAnswer'), message: 'freeAnswer を書くときは choices も書いてください' })
    if (value['kind'] !== undefined || value['task'] !== undefined) {
      errs.push({ path, message: '返事（choices）のない往復（締めの台詞）には、kind・task を書けません' })
    }
  }
  if (decision && value['freeAnswer'] !== undefined) {
    errs.push({ path: joinPath(path, 'freeAnswer'), message: '選択の往復（"kind": "decision"）には freeAnswer を書けません（選ぶだけにします）' })
  }
  if (lines === undefined) return undefined
  const turn: ConversationTurn = { lines }
  if (decision) turn.kind = 'decision'
  if (task !== undefined) turn.task = task
  if (choices !== undefined) turn.choices = choices
  if (freeAnswer !== undefined) turn.freeAnswer = freeAnswer
  return turn
}

function parseConversation(o: Obj, ctx: ReferenceContext, errs: FieldError[]): Conversation | undefined {
  if (o['turns'] === undefined && (o['lines'] !== undefined || o['choices'] !== undefined)) {
    errs.push({ path: 'turns', message: '会話の書き方が変わりました（GAME_SPEC v2.3）。lines・choices・freeAnswer は "turns": [ { ... } ] の中に書いてください' })
    return undefined
  }
  checkKnownKeys(o, CONVERSATION_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.conversation, 'cafe_001', errs)
  const chapter = integer(o, 'chapter', '', errs, 1, MAX_CHAPTER)
  const location = reference(o, 'location', '', errs, ctx.locationIds, '施設ID')
  const character = reference(o, 'character', '', errs, ctx.characterIds, 'キャラクターID')
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)

  const turnItems = objArray(o, 'turns', '', errs, 1) ?? []
  const turns: ConversationTurn[] = []
  turnItems.forEach(({ value, path }, i) => {
    const turn = parseTurn(value, path, i, i === turnItems.length - 1, ctx, errs)
    if (turn !== undefined) turns.push(turn)
  })
  if (turnItems.length > 0 && !turnItems.some(({ value }) => value['choices'] !== undefined)) {
    errs.push({ path: 'turns', message: '返事（choices）のある往復を1つ以上入れてください' })
  }

  if (errs.length > 0 || id === undefined || chapter === undefined || location === undefined || character === undefined || reviewed === undefined) {
    return undefined
  }
  const conversation: Conversation = { id, chapter, location, character, turns, reviewed }
  if (notes !== undefined) conversation.notes = notes
  return conversation
}

const COLUMN_KEYS = ['id', 'chapter', 'titleJa', 'blocks', 'reviewed', 'notes'] as const
const COLUMN_BLOCK_KEYS: Record<ColumnBlock['type'], readonly string[]> = {
  text: ['type', 'textJa'],
  korean: ['type', 'korean', 'pronunciation', 'japanese'],
}

function parseColumn(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Column | undefined {
  checkKnownKeys(o, COLUMN_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.column, 'column_001', errs)
  const chapter = integer(o, 'chapter', '', errs, 1, MAX_CHAPTER)
  const titleJa = japaneseText(o, 'titleJa', '', errs)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  const blocks: ColumnBlock[] = []
  for (const { value, path } of objArray(o, 'blocks', '', errs, 1) ?? []) {
    const type = oneOf(value, 'type', path, errs, COLUMN_BLOCK_TYPES)
    if (type === undefined) continue
    checkKnownKeys(value, COLUMN_BLOCK_KEYS[type], path, errs)
    if (type === 'text') {
      const textJa = japaneseText(value, 'textJa', path, errs)
      if (textJa !== undefined) blocks.push({ type, textJa })
    } else {
      const korean = text(value, 'korean', path, errs)
      const pronunciation = reading(value, 'pronunciation', path, errs, korean)
      const japanese = text(value, 'japanese', path, errs)
      if (korean !== undefined && pronunciation !== undefined && japanese !== undefined) blocks.push({ type, korean, pronunciation, japanese })
    }
  }
  if (errs.length > 0 || id === undefined || chapter === undefined || titleJa === undefined || reviewed === undefined) return undefined
  const column: Column = { id, chapter, titleJa, blocks, reviewed }
  if (notes !== undefined) column.notes = notes
  return column
}

const MAP_AREA_KEYS = ['x', 'y', 'w', 'h'] as const

function percent(o: Obj, key: string, base: string, errs: FieldError[]): number | undefined {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
    errs.push({ path: joinPath(base, key), message: '0〜100の数にしてください（絵の幅・高さに対する割合）' })
    return undefined
  }
  return v
}

function parseLocation(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Location | undefined {
  checkKnownKeys(o, ['id', 'nameJa', 'mapArea'], '', errs)
  const id = idField(o, ID_PATTERNS.key, 'cafe', errs)
  const nameJa = japaneseText(o, 'nameJa', '', errs)
  let mapArea: MapArea | undefined
  const rawArea = o['mapArea']
  if (rawArea !== undefined) {
    if (!isObj(rawArea)) {
      errs.push({ path: 'mapArea', message: 'オブジェクト（{ }）にしてください' })
    } else {
      checkKnownKeys(rawArea, MAP_AREA_KEYS, 'mapArea', errs)
      const x = percent(rawArea, 'x', 'mapArea', errs)
      const y = percent(rawArea, 'y', 'mapArea', errs)
      const w = percent(rawArea, 'w', 'mapArea', errs)
      const h = percent(rawArea, 'h', 'mapArea', errs)
      if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
        if (w === 0 || h === 0 || x + w > 100 || y + h > 100) errs.push({ path: 'mapArea', message: '範囲が絵の外にはみ出しているか、幅・高さが0です' })
        else mapArea = { x, y, w, h }
      }
    }
  }
  if (errs.length > 0 || id === undefined || nameJa === undefined) return undefined
  const location: Location = { id, nameJa }
  if (mapArea !== undefined) location.mapArea = mapArea
  return location
}

const CHARACTER_KEYS = ['id', 'roleJa', 'name', 'profileJa', 'themeColor'] as const
const CHARACTER_NAME_KEYS = ['korean', 'pronunciation', 'reviewed'] as const
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

function parseCharacter(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Character | undefined {
  checkKnownKeys(o, CHARACTER_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.key, 'cafe_staff', errs)
  const roleJa = japaneseText(o, 'roleJa', '', errs)
  if (id === PLAYER_SPEAKER_ID) errs.push({ path: 'id', message: `"${PLAYER_SPEAKER_ID}" は主人公用に予約されています` })
  let name: CharacterName | undefined
  const rawName = o['name']
  if (rawName !== undefined) {
    if (!isObj(rawName)) {
      errs.push({ path: 'name', message: 'オブジェクト（{ }）にしてください' })
    } else {
      checkKnownKeys(rawName, CHARACTER_NAME_KEYS, 'name', errs)
      const korean = text(rawName, 'korean', 'name', errs)
      const pronunciation = reading(rawName, 'pronunciation', 'name', errs, korean)
      const reviewed = bool(rawName, 'reviewed', 'name', errs)
      if (korean !== undefined && pronunciation !== undefined && reviewed !== undefined) name = { korean, pronunciation, reviewed }
    }
  }
  const profileJa = o['profileJa'] === undefined ? undefined : japaneseText(o, 'profileJa', '', errs)
  const themeColor = optionalText(o, 'themeColor', '', errs)
  if (themeColor !== undefined && !HEX_COLOR.test(themeColor)) errs.push({ path: 'themeColor', message: '#RRGGBB の形（例：#B9783F）にしてください' })
  if (errs.length > 0 || id === undefined || roleJa === undefined) return undefined
  const character: Character = { id, roleJa }
  if (name !== undefined) character.name = name
  if (profileJa !== undefined) character.profileJa = profileJa
  if (themeColor !== undefined) character.themeColor = themeColor
  return character
}

const EVENT_KEYS = ['id', 'chapter', 'location', 'requires', 'objectiveJa', 'actionJa', 'steps', 'notes'] as const
const STEP_KEYS: Record<EventStep['type'], readonly string[]> = {
  message: ['type', 'textJa'],
  learn: ['type', 'vocabulary', 'grammar'],
  conversation: ['type', 'id'],
  column: ['type', 'id'],
  dictionary: ['type', 'textJa'],
  dayEnd: ['type', 'textJa'],
  background: ['type', 'id'],
}

function parseStep(value: Obj, path: string, eventLocation: string | undefined, ctx: ReferenceContext, errs: FieldError[]): EventStep | undefined {
  const type = oneOf(value, 'type', path, errs, EVENT_STEP_TYPES)
  if (type === undefined) return undefined
  checkKnownKeys(value, STEP_KEYS[type], path, errs)
  switch (type) {
    case 'message':
    case 'dictionary':
    case 'dayEnd': {
      const textJa = japaneseText(value, 'textJa', path, errs)
      return textJa === undefined ? undefined : { type, textJa }
    }
    case 'learn': {
      const vocabulary = idList(value, 'vocabulary', path, errs, ctx.vocabularyIds, '単語ID', true) ?? []
      const grammar = idList(value, 'grammar', path, errs, ctx.grammarIds, '文法ID', true) ?? []
      if (vocabulary.length + grammar.length === 0) {
        errs.push({ path, message: 'vocabulary か grammar に、1つ以上のIDを入れてください' })
        return undefined
      }
      return { type, vocabulary, grammar }
    }
    case 'conversation': {
      const id = text(value, 'id', path, errs)
      if (id === undefined) return undefined
      const convLocation = ctx.conversationLocations.get(id)
      if (convLocation === undefined) {
        errs.push({ path: joinPath(path, 'id'), message: `存在しない会話IDです：${id}` })
        return undefined
      }
      if (eventLocation !== undefined && convLocation !== eventLocation) {
        errs.push({ path: joinPath(path, 'id'), message: `会話 ${id} の施設（${convLocation}）が、イベントの施設（${eventLocation}）と違います` })
        return undefined
      }
      return { type, id }
    }
    case 'column': {
      const id = text(value, 'id', path, errs)
      if (id === undefined) return undefined
      if (!ctx.columnIds.has(id)) {
        errs.push({ path: joinPath(path, 'id'), message: `存在しないコラムIDです：${id}` })
        return undefined
      }
      return { type, id }
    }
    case 'background': {
      const id = text(value, 'id', path, errs)
      if (id === undefined) return undefined
      if (!(SCENE_BACKGROUNDS as readonly string[]).includes(id) && !ctx.locationIds.has(id)) {
        errs.push({ path: joinPath(path, 'id'), message: `存在しない背景IDです：${id}（場面の背景 ${SCENE_BACKGROUNDS.join('・')} か、施設ID）` })
        return undefined
      }
      return { type, id }
    }
  }
}

function parseEvent(o: Obj, ctx: ReferenceContext, errs: FieldError[]): GameEvent | undefined {
  checkKnownKeys(o, EVENT_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.event, 'event_001', errs)
  const chapter = integer(o, 'chapter', '', errs, 1, MAX_CHAPTER)
  const location = reference(o, 'location', '', errs, ctx.locationIds, '施設ID')
  // requires は全イベントを読んだ後で確かめる（loadContent）。ここでは形だけ
  const requires = textArray(o, 'requires', '', errs, { optional: false, min: 0 })
  const objectiveJa = japaneseText(o, 'objectiveJa', '', errs)
  const actionJa = japaneseText(o, 'actionJa', '', errs)
  const notes = optionalText(o, 'notes', '', errs)

  const steps: EventStep[] = []
  for (const { value, path } of objArray(o, 'steps', '', errs, 1) ?? []) {
    const step = parseStep(value, path, location, ctx, errs)
    if (step !== undefined) steps.push(step)
  }
  if (steps.at(-1)?.type === 'background') {
    errs.push({ path: 'steps', message: '最後の段階に background は置けません（イベントが終わると、施設のふだんの背景に戻ります）' })
  }
  const conversationIds = steps.flatMap((s) => (s.type === 'conversation' ? [s.id] : []))
  if (new Set(conversationIds).size !== conversationIds.length) {
    errs.push({ path: 'steps', message: '同じ会話を1つのイベントの中で2回使っています' })
  }

  if (errs.length > 0 || id === undefined || chapter === undefined || location === undefined || requires === undefined || objectiveJa === undefined || actionJa === undefined) {
    return undefined
  }
  if (requires.includes(id)) {
    errs.push({ path: 'requires', message: '自分自身を前提にはできません' })
    return undefined
  }
  const event: GameEvent = { id, chapter, location, requires, objectiveJa, actionJa, steps }
  if (notes !== undefined) event.notes = notes
  return event
}

// ---------- ハングルのレッスン ----------

/** 韓国語の文（字母を単体で書いていないこと） */
function koreanText(o: Obj, key: string, base: string, errs: FieldError[]): string | undefined {
  const v = text(o, key, base, errs)
  if (v !== undefined && containsIsolatedJamo(v)) {
    errs.push({ path: joinPath(base, key), message: '字母（ㄱ・ㅏ など）を単体で書かず、音節（가 など）に組み立てて書いてください' })
    return undefined
  }
  return v
}

/** 字母1つ（allowed のどれか） */
function jamoField(o: Obj, key: string, base: string, errs: FieldError[], allowed: readonly string[], label: string): string | undefined {
  const v = text(o, key, base, errs)
  if (v === undefined) return undefined
  if (!allowed.includes(v)) {
    errs.push({ path: joinPath(base, key), message: `${label}を1つ書いてください（使える字母：${allowed.join(' ')}）` })
    return undefined
  }
  return v
}

function jamoArray(o: Obj, key: string, base: string, errs: FieldError[], allowed: readonly string[], label: string, optional: boolean): string[] | undefined {
  const list = textArray(o, key, base, errs, { optional, min: 1 })
  if (list === undefined) return undefined
  const wrong = list.filter((j) => !allowed.includes(j))
  if (wrong.length > 0) {
    errs.push({ path: joinPath(base, key), message: `${label}ではありません：${wrong.join(' ')}（使える字母：${allowed.join(' ')}）` })
    return undefined
  }
  return list
}

const SOUND_KEYS = ['korean', 'pronunciation'] as const

/**
 * 聞かせる音節（sounds）。どれも1音節で、check が null を返すこと（null 以外はエラーの理由）。
 * 読みはカタカナで、区切りなし。
 */
function parseSounds(o: Obj, base: string, errs: FieldError[], check: (s: Syllable) => string | null): HangulSound[] {
  const sounds: HangulSound[] = []
  for (const { value, path } of objArray(o, 'sounds', base, errs, 1) ?? []) {
    checkKnownKeys(value, SOUND_KEYS, path, errs)
    const korean = koreanText(value, 'korean', path, errs)
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    if (korean === undefined || pronunciation === undefined) continue
    const syllable = splitSyllable(korean)
    if (syllable === null) {
      errs.push({ path: joinPath(path, 'korean'), message: '1つの音節（例：가）にしてください' })
      continue
    }
    const problem = check(syllable)
    if (problem !== null) {
      errs.push({ path: joinPath(path, 'korean'), message: problem })
      continue
    }
    sounds.push({ korean, pronunciation })
  }
  if (new Set(sounds.map((s) => s.korean)).size !== sounds.length) {
    errs.push({ path: joinPath(base, 'sounds'), message: '同じ音節が重複しています' })
  }
  return sounds
}

const LETTER_KEYS = ['jamo', 'sounds', 'tipJa', 'confusableWith'] as const

function parseLetters(o: Obj, errs: FieldError[]): HangulLetter[] {
  const letters: HangulLetter[] = []
  for (const { value, path } of objArray(o, 'letters', '', errs, 1) ?? []) {
    checkKnownKeys(value, LETTER_KEYS, path, errs)
    const jamo = jamoField(value, 'jamo', path, errs, LETTER_JAMO, '子音か母音の字母')
    const sounds = parseSounds(value, path, errs, (s) => {
      if (s.final !== null) return 'パッチムのない音節にしてください'
      if (jamo === undefined) return null
      if (isVowel(jamo)) return s.medial === jamo ? null : `母音 ${jamo} の音節にしてください（文頭に ㅇ を付けた形など）`
      return s.initial === jamo ? null : `子音 ${jamo} で始まる音節にしてください`
    })
    const tipJa = text(value, 'tipJa', path, errs)
    const confusableWith = jamoArray(value, 'confusableWith', path, errs, LETTER_JAMO, '子音か母音の字母', true)
    if (jamo !== undefined && confusableWith?.includes(jamo)) {
      errs.push({ path: joinPath(path, 'confusableWith'), message: '自分自身（jamo と同じ字母）は入れないでください' })
    }
    if (jamo === undefined || tipJa === undefined) continue
    const letter: HangulLetter = { jamo, sounds, tipJa }
    if (confusableWith !== undefined) letter.confusableWith = confusableWith
    letters.push(letter)
  }
  if (new Set(letters.map((l) => l.jamo)).size !== letters.length) {
    errs.push({ path: 'letters', message: '同じ字母が重複しています' })
  }
  return letters
}

const FINAL_KEYS = ['sound', 'letters', 'sounds', 'tipJa'] as const

function parseFinals(o: Obj, errs: FieldError[]): HangulFinal[] {
  const finals: HangulFinal[] = []
  for (const { value, path } of objArray(o, 'finals', '', errs, 1) ?? []) {
    checkKnownKeys(value, FINAL_KEYS, path, errs)
    const sound = jamoField(value, 'sound', path, errs, REPRESENTATIVE_FINALS, 'パッチムの代表音')
    const letters = jamoArray(value, 'letters', path, errs, FINAL_CONSONANTS, 'パッチムになる字母', false)
    const sounds = parseSounds(value, path, errs, (s) => {
      if (s.final === null) return 'パッチムのある音節にしてください（例：악）'
      if (letters === undefined) return null
      return letters.includes(s.final) ? null : `パッチムが letters のどれか（${letters.join(' ')}）の音節にしてください`
    })
    const tipJa = text(value, 'tipJa', path, errs)
    if (sound === undefined || letters === undefined || tipJa === undefined) continue
    finals.push({ sound, letters, sounds, tipJa })
  }
  if (new Set(finals.map((f) => f.sound)).size !== finals.length) {
    errs.push({ path: 'finals', message: '同じ代表音のグループが重複しています' })
  }
  const allLetters = finals.flatMap((f) => f.letters)
  if (new Set(allLetters).size !== allLetters.length) {
    errs.push({ path: 'finals', message: '同じパッチムの字母が、複数のグループに入っています' })
  }
  return finals
}

const RULE_KEYS = ['titleJa', 'explanationJa', 'examples'] as const
const RULE_EXAMPLE_KEYS = ['korean', 'spoken', 'pronunciation', 'japanese'] as const

function parseRules(o: Obj, errs: FieldError[]): SoundChangeRule[] {
  const rules: SoundChangeRule[] = []
  for (const { value, path } of objArray(o, 'rules', '', errs, 1) ?? []) {
    checkKnownKeys(value, RULE_KEYS, path, errs)
    const titleJa = japaneseText(value, 'titleJa', path, errs)
    const explanationJa = text(value, 'explanationJa', path, errs)
    const examples: SoundChangeExample[] = []
    for (const { value: ex, path: exPath } of objArray(value, 'examples', path, errs, 1) ?? []) {
      checkKnownKeys(ex, RULE_EXAMPLE_KEYS, exPath, errs)
      const korean = koreanText(ex, 'korean', exPath, errs)
      const spoken = koreanText(ex, 'spoken', exPath, errs)
      const pronunciation = reading(ex, 'pronunciation', exPath, errs, korean)
      const japanese = text(ex, 'japanese', exPath, errs)
      if (korean !== undefined && spoken !== undefined && koreanChunkCount(korean) !== koreanChunkCount(spoken)) {
        errs.push({ path: joinPath(exPath, 'spoken'), message: 'korean と同じ位置で空白を入れてください（区切りの数が違います）' })
      }
      if (korean !== undefined && spoken !== undefined && pronunciation !== undefined && japanese !== undefined) {
        examples.push({ korean, spoken, pronunciation, japanese })
      }
    }
    if (titleJa !== undefined && explanationJa !== undefined) rules.push({ titleJa, explanationJa, examples })
  }
  return rules
}

const WORD_KEYS = ['id', 'korean', 'pronunciation', 'japanese'] as const

function parseWords(o: Obj, errs: FieldError[], min: number): HangulWord[] {
  const words: HangulWord[] = []
  for (const { value, path } of objArray(o, 'words', '', errs, min) ?? []) {
    checkKnownKeys(value, WORD_KEYS, path, errs)
    const id = text(value, 'id', path, errs)
    if (id !== undefined && !ID_PATTERNS.hangulWord.test(id)) errs.push({ path: joinPath(path, 'id'), message: 'IDの形式が違います（例：hword_001）' })
    const korean = koreanText(value, 'korean', path, errs)
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    const japanese = text(value, 'japanese', path, errs)
    if (id !== undefined && korean !== undefined && pronunciation !== undefined && japanese !== undefined) words.push({ id, korean, pronunciation, japanese })
  }
  if (new Set(words.map((w) => w.id)).size !== words.length) errs.push({ path: 'words', message: '同じIDの単語が重複しています' })
  if (new Set(words.map((w) => w.korean)).size !== words.length) errs.push({ path: 'words', message: '同じ韓国語の単語が重複しています' })
  return words
}

const HANGUL_LESSON_KEYS = ['id', 'order', 'kind', 'titleJa', 'introJa', 'letters', 'finals', 'rules', 'words', 'vocabulary', 'reviewed', 'notes'] as const

/** レッスンの種類ごとに書く項目。required は必須、optional は任意。どちらにもない項目は書けない */
const HANGUL_SECTIONS: Record<HangulLessonKind, { required: readonly string[]; optional: readonly string[] }> = {
  letters: { required: ['letters', 'words'], optional: [] },
  batchim: { required: ['finals', 'words'], optional: [] },
  soundChange: { required: ['rules'], optional: ['words'] },
  reading: { required: [], optional: ['words', 'vocabulary'] },
}
const HANGUL_SECTION_KEYS = ['letters', 'finals', 'rules', 'words', 'vocabulary'] as const

function parseHangulLesson(o: Obj, ctx: ReferenceContext, errs: FieldError[]): HangulLesson | undefined {
  checkKnownKeys(o, HANGUL_LESSON_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.hangulLesson, 'hangul_001', errs)
  const order = integer(o, 'order', '', errs, 1)
  const kind = oneOf(o, 'kind', '', errs, HANGUL_LESSON_KINDS)
  const titleJa = japaneseText(o, 'titleJa', '', errs)
  const introJa = textArray(o, 'introJa', '', errs, { optional: false, min: 1 })
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  if (kind === undefined) return undefined

  const sections = HANGUL_SECTIONS[kind]
  for (const key of HANGUL_SECTION_KEYS) {
    if (o[key] !== undefined && !sections.required.includes(key) && !sections.optional.includes(key)) {
      errs.push({ path: key, message: `kind が "${kind}" のレッスンには ${key} は書けません（書ける項目：${[...sections.required, ...sections.optional].join(', ') || 'なし'}）` })
    }
  }
  const has = (key: string) => sections.required.includes(key) || (sections.optional.includes(key) && o[key] !== undefined)
  const letters = has('letters') ? parseLetters(o, errs) : []
  const finals = has('finals') ? parseFinals(o, errs) : []
  const rules = has('rules') ? parseRules(o, errs) : []
  const words = has('words') ? parseWords(o, errs, 1) : []
  const vocabulary = has('vocabulary') ? (idList(o, 'vocabulary', '', errs, ctx.vocabularyIds, '単語ID', false) ?? []) : []
  if (kind === 'reading' && o['words'] === undefined && o['vocabulary'] === undefined) {
    errs.push({ path: 'words', message: 'reading のレッスンには、words か vocabulary の少なくとも一方を書いてください' })
  }

  if (errs.length > 0 || id === undefined || order === undefined || titleJa === undefined || introJa === undefined || reviewed === undefined) return undefined
  const lesson: HangulLesson = { id, order, kind, titleJa, introJa, letters, finals, rules, words, vocabulary, reviewed }
  if (notes !== undefined) lesson.notes = notes
  return lesson
}

// ---------- リスニングの文 ----------

const LISTENING_KEYS = ['id', 'afterEvent', 'korean', 'pronunciation', 'japanese', 'distractors', 'reviewed', 'notes'] as const
const LISTENING_OPTION_KEYS = ['korean', 'pronunciation', 'japanese'] as const

function parseListening(o: Obj, ctx: ReferenceContext, errs: FieldError[]): ListeningSentence | undefined {
  checkKnownKeys(o, LISTENING_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.listening, 'listen_001', errs)
  const afterEvent = reference(o, 'afterEvent', '', errs, ctx.eventIds, 'イベントID')
  const korean = koreanText(o, 'korean', '', errs)
  const pronunciation = reading(o, 'pronunciation', '', errs, korean)
  const japanese = text(o, 'japanese', '', errs)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  const distractors: ListeningOption[] = []
  for (const { value, path } of objArray(o, 'distractors', '', errs, 1) ?? []) {
    checkKnownKeys(value, LISTENING_OPTION_KEYS, path, errs)
    const k = koreanText(value, 'korean', path, errs)
    const p = reading(value, 'pronunciation', path, errs, k)
    const j = text(value, 'japanese', path, errs)
    if (k !== undefined && p !== undefined && j !== undefined) distractors.push({ korean: k, pronunciation: p, japanese: j })
  }
  // 空白（分かち書き）や句読点の違いだけの文は、聞いても区別できないので選択肢にできない
  const keys = [korean, ...distractors.map((d) => d.korean)].filter((k) => k !== undefined).map((k) => normalizeAnswer(k).replace(/ /g, ''))
  if (new Set(keys).size !== keys.length) {
    errs.push({ path: 'distractors', message: '正解の文と同じ文（空白・句読点の違いだけのものを含む）や、重複した文があります' })
  }
  if (errs.length > 0 || id === undefined || afterEvent === undefined || korean === undefined || pronunciation === undefined || japanese === undefined || reviewed === undefined) {
    return undefined
  }
  const sentence: ListeningSentence = { id, afterEvent, korean, pronunciation, japanese, distractors, reviewed }
  if (notes !== undefined) sentence.notes = notes
  return sentence
}

// ---------- 基礎ドリルと章末テスト（GAME_SPEC 4-9） ----------

const DRILL_ITEM_KEYS = ['id', 'korean', 'alternatives', 'pronunciation', 'japanese', 'digits', 'hintJa'] as const
/** 数字の問題の答え：半角数字。時刻・日付は : と / で区切る（例：3500、3:30、5/15） */
const DIGITS_PATTERN = /^[0-9]+([:/][0-9]+)*$/
/** 選ぶ問題で、正解のほかに選択肢を2つ作るため */
export const MIN_DRILL_ITEMS = 4

/** ドリル・テストの問題（items）。min 個以上。optional なら省略できる（省略したら []） */
function parseDrillItems(o: Obj, errs: FieldError[], min: number, optional: boolean): DrillItem[] {
  if (optional && o['items'] === undefined) return []
  const items: DrillItem[] = []
  for (const { value, path } of objArray(o, 'items', '', errs, min) ?? []) {
    checkKnownKeys(value, DRILL_ITEM_KEYS, path, errs)
    const id = text(value, 'id', path, errs)
    if (id !== undefined && !ID_PATTERNS.drillItem.test(id)) errs.push({ path: joinPath(path, 'id'), message: 'IDの形式が違います（例：dq_001）' })
    const korean = koreanText(value, 'korean', path, errs)
    if (korean !== undefined && !HANGUL.test(korean)) errs.push({ path: joinPath(path, 'korean'), message: '韓国語（ハングル）で書いてください' })
    const alternatives = textArray(value, 'alternatives', path, errs, { optional: true, min: 1 })
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    const japanese = japaneseText(value, 'japanese', path, errs)
    const digits = optionalText(value, 'digits', path, errs)
    const hintJa = value['hintJa'] === undefined ? undefined : japaneseText(value, 'hintJa', path, errs)
    if (digits !== undefined && !DIGITS_PATTERN.test(digits)) {
      errs.push({ path: joinPath(path, 'digits'), message: '半角数字で書いてください。時刻・日付は : と / で区切ります（例：3500、3:30、5/15）。カンマ・単位は入れません' })
    }
    if (korean !== undefined && alternatives?.includes(korean)) {
      errs.push({ path: joinPath(path, 'alternatives'), message: 'korean と同じ文字列は alternatives に入れないでください' })
    }
    // 日本語を見て韓国語を書く問題は、読み方を書く練習なので、数字だけの答えは正解にしない
    for (const [i, alt] of (alternatives ?? []).entries()) {
      if (!HANGUL.test(alt)) errs.push({ path: joinPath(joinPath(path, 'alternatives'), i), message: '別解も韓国語（ハングル）で書いてください（数字だけの答えは正解にしません）' })
    }
    if (id === undefined || korean === undefined || pronunciation === undefined || japanese === undefined) continue
    const item: DrillItem = { id, korean, pronunciation, japanese }
    if (alternatives !== undefined) item.alternatives = alternatives
    if (digits !== undefined) item.digits = digits
    if (hintJa !== undefined) item.hintJa = hintJa
    items.push(item)
  }
  if (new Set(items.map((i) => i.id)).size !== items.length) errs.push({ path: 'items', message: '同じIDの問題が重複しています' })
  if (new Set(items.map((i) => normalizeAnswer(i.korean))).size !== items.length) errs.push({ path: 'items', message: '同じ韓国語の問題が重複しています' })
  return items
}

const DRILL_KEYS = ['id', 'titleJa', 'introJa', 'questionCount', 'items', 'reviewed', 'notes'] as const

function parseDrill(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Drill | undefined {
  checkKnownKeys(o, DRILL_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.drill, 'drill_001', errs)
  const titleJa = japaneseText(o, 'titleJa', '', errs)
  const introJa = optionalText(o, 'introJa', '', errs)
  const questionCount = o['questionCount'] === undefined ? undefined : integer(o, 'questionCount', '', errs, 1, 50)
  const items = parseDrillItems(o, errs, MIN_DRILL_ITEMS, false)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  if (errs.length > 0 || id === undefined || titleJa === undefined || reviewed === undefined) return undefined
  const drill: Drill = { id, titleJa, items, reviewed }
  if (introJa !== undefined) drill.introJa = introJa
  if (questionCount !== undefined) drill.questionCount = questionCount
  if (notes !== undefined) drill.notes = notes
  return drill
}

const CHAPTER_TEST_KEYS = ['id', 'chapter', 'titleJa', 'questionCount', 'passPercent', 'items', 'reviewed', 'notes'] as const

function parseChapterTest(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): ChapterTest | undefined {
  checkKnownKeys(o, CHAPTER_TEST_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.chapterTest, 'test_001', errs)
  const chapter = integer(o, 'chapter', '', errs, 1, MAX_CHAPTER)
  const titleJa = japaneseText(o, 'titleJa', '', errs)
  const questionCount = o['questionCount'] === undefined ? undefined : integer(o, 'questionCount', '', errs, 1, 50)
  const passPercent = o['passPercent'] === undefined ? undefined : integer(o, 'passPercent', '', errs, 0, 100)
  const items = parseDrillItems(o, errs, 1, true)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  if (errs.length > 0 || id === undefined || chapter === undefined || titleJa === undefined || reviewed === undefined) return undefined
  const test: ChapterTest = { id, chapter, titleJa, items, reviewed }
  if (questionCount !== undefined) test.questionCount = questionCount
  if (passPercent !== undefined) test.passPercent = passPercent
  if (notes !== undefined) test.notes = notes
  return test
}

/**
 * ドリルとテストの問題のIDを、ほかの教材とまたいで一意にする（復習の記録が問題のIDで参照するため）。
 * 章末テストは1章に1つまで。問題のあるものは除外する（後から出てきた方）
 */
function checkDrillItemIds<T extends { id: string; items: DrillItem[] }>(list: T[], contentIds: Map<string, string>, issues: ValidationIssue[]): T[] {
  return list.filter((entry) => {
    const file = contentIds.get(entry.id) ?? ''
    const clash = entry.items.find((item) => contentIds.has(item.id))
    if (clash !== undefined) {
      issues.push({ file, index: null, id: entry.id, path: 'items', message: `問題のID ${clash.id} が重複しています（最初の定義：${contentIds.get(clash.id) ?? ''}）。後から出てきた方を除外しました` })
      return false
    }
    for (const item of entry.items) contentIds.set(item.id, file)
    return true
  })
}

function checkOneTestPerChapter(tests: ChapterTest[], contentIds: Map<string, string>, issues: ValidationIssue[]): ChapterTest[] {
  const owner = new Map<number, string>()
  return tests.filter((t) => {
    const first = owner.get(t.chapter)
    if (first !== undefined) {
      issues.push({ file: contentIds.get(t.id) ?? '', index: null, id: t.id, path: 'chapter', message: `第${t.chapter}章のテストは、すでに ${first} があります。後から出てきた方を除外しました` })
      return false
    }
    owner.set(t.chapter, t.id)
    return true
  })
}

// ---------- ファイル単位の検証 ----------

type ItemParser<T> = (o: Obj, ctx: ReferenceContext, errs: FieldError[]) => T | undefined

export interface FileResult<T> {
  items: T[]
  issues: ValidationIssue[]
}

function validateFileWith<T extends { id: string }>(file: string, raw: unknown, parse: ItemParser<T>, ctx: ReferenceContext): FileResult<T> {
  if (!Array.isArray(raw)) {
    return { items: [], issues: [{ file, index: null, id: null, path: '', message: 'ファイル全体を配列（[ ]）にしてください' }] }
  }
  const items: T[] = []
  const issues: ValidationIssue[] = []
  raw.forEach((entry: unknown, index) => {
    if (!isObj(entry)) {
      issues.push({ file, index, id: null, path: '', message: 'オブジェクト（{ }）にしてください' })
      return
    }
    const errs: FieldError[] = []
    const item = parse(entry, ctx, errs)
    const rawId = typeof entry['id'] === 'string' ? entry['id'] : null
    for (const e of errs) issues.push({ file, index, id: rawId, path: e.path, message: e.message })
    if (item !== undefined && errs.length === 0) items.push(item)
  })
  return { items, issues }
}

const PARSERS = {
  vocabulary: parseVocab,
  grammar: parseGrammar,
  conversations: parseConversation,
  columns: parseColumn,
  events: parseEvent,
  locations: parseLocation,
  characters: parseCharacter,
  hangulLessons: parseHangulLesson,
  listening: parseListening,
  drills: parseDrill,
  chapterTests: parseChapterTest,
} as const

interface KindItem {
  vocabulary: Vocab
  grammar: Grammar
  conversations: Conversation
  columns: Column
  events: GameEvent
  locations: Location
  characters: Character
  hangulLessons: HangulLesson
  listening: ListeningSentence
  drills: Drill
  chapterTests: ChapterTest
}

/** 1ファイル分を検証する。ファイル内の構造と参照だけを確かめ、ファイルをまたぐIDの重複は loadContent で確かめる */
export function validateFile<K extends ContentKind>(kind: K, file: string, raw: unknown, ctx: ReferenceContext): FileResult<KindItem[K]> {
  // PARSERS[kind] は K に対応するパーサーだが、TypeScript は添字アクセスで型を絞り込めないため明示する
  const parser = PARSERS[kind] as ItemParser<KindItem[K]>
  return validateFileWith(file, raw, parser, ctx)
}

// ---------- すべてのデータの読み込み ----------

/** ファイル名 → JSONの中身 */
export type FileMap = Readonly<Record<string, unknown>>

export interface ContentInput {
  vocabulary: FileMap
  grammar: FileMap
  conversations: FileMap
  columns: FileMap
  events: FileMap
  locations: FileMap
  characters: FileMap
  hangulLessons: FileMap
  listening: FileMap
  drills: FileMap
  chapterTests: FileMap
  /** ゲームの調整用の数値。ファイルは1つだけ置く */
  balance: FileMap
}

export interface LoadedContent {
  vocabulary: Vocab[]
  grammar: Grammar[]
  conversations: Conversation[]
  columns: Column[]
  /** ファイル内の順番どおり。同じ施設で行えるイベントが複数あれば、先のものから行う */
  events: GameEvent[]
  locations: Location[]
  characters: Character[]
  /** order の順に並べたもの */
  hangulLessons: HangulLesson[]
  listening: ListeningSentence[]
  /** ファイルの名前順・ファイル内の順 */
  drills: Drill[]
  /** 章の順 */
  chapterTests: ChapterTest[]
  balance: Balance
  issues: ValidationIssue[]
}

/** balance.json が読めなかったときに使う値（ゲームを止めないため） */
export const DEFAULT_BALANCE: Balance = {
  xp: { learnWord: 2, conversationChoice: 10, conversationWrite: 15, eventComplete: 20, hangulLesson: 20, listening: 3 },
  furiganaAlwaysUntilChapter: 3,
  initialLocations: ['home', 'cafe'],
  startLocation: 'home',
  writeAttemptsBeforeReveal: 2,
  hangulQuizQuestions: 8,
  hangulPassPercent: 80,
  listeningQuestionsPerRound: 5,
}

const BALANCE_KEYS = [
  'xp',
  'furiganaAlwaysUntilChapter',
  'initialLocations',
  'startLocation',
  'writeAttemptsBeforeReveal',
  'hangulQuizQuestions',
  'hangulPassPercent',
  'listeningQuestionsPerRound',
] as const
const XP_KEYS = ['learnWord', 'conversationChoice', 'conversationWrite', 'eventComplete', 'hangulLesson', 'listening'] as const

function parseBalance(raw: unknown, ctx: ReferenceContext, errs: FieldError[]): Balance | undefined {
  if (!isObj(raw)) {
    errs.push({ path: '', message: 'オブジェクト（{ }）にしてください' })
    return undefined
  }
  checkKnownKeys(raw, BALANCE_KEYS, '', errs)
  const rawXp = raw['xp']
  const xp: Partial<Balance['xp']> = {}
  if (!isObj(rawXp)) {
    errs.push({ path: 'xp', message: 'オブジェクト（{ }）にしてください' })
  } else {
    checkKnownKeys(rawXp, XP_KEYS, 'xp', errs)
    for (const key of XP_KEYS) xp[key] = integer(rawXp, key, 'xp', errs, 0)
  }
  const furiganaAlwaysUntilChapter = integer(raw, 'furiganaAlwaysUntilChapter', '', errs, 0, MAX_CHAPTER)
  const initialLocations = idList(raw, 'initialLocations', '', errs, ctx.locationIds, '施設ID', false)
  const startLocation = reference(raw, 'startLocation', '', errs, ctx.locationIds, '施設ID')
  const writeAttemptsBeforeReveal = integer(raw, 'writeAttemptsBeforeReveal', '', errs, 1)
  const hangulQuizQuestions = integer(raw, 'hangulQuizQuestions', '', errs, 1, 50)
  const hangulPassPercent = integer(raw, 'hangulPassPercent', '', errs, 0, 100)
  const listeningQuestionsPerRound = integer(raw, 'listeningQuestionsPerRound', '', errs, 1, 50)
  if (startLocation !== undefined && initialLocations !== undefined && !initialLocations.includes(startLocation)) {
    errs.push({ path: 'startLocation', message: 'startLocation は initialLocations に含めてください' })
  }
  const { learnWord, conversationChoice, conversationWrite, eventComplete, hangulLesson, listening } = xp
  if (
    errs.length > 0 ||
    learnWord === undefined ||
    conversationChoice === undefined ||
    conversationWrite === undefined ||
    eventComplete === undefined ||
    hangulLesson === undefined ||
    listening === undefined ||
    furiganaAlwaysUntilChapter === undefined ||
    initialLocations === undefined ||
    startLocation === undefined ||
    writeAttemptsBeforeReveal === undefined ||
    hangulQuizQuestions === undefined ||
    hangulPassPercent === undefined ||
    listeningQuestionsPerRound === undefined
  ) {
    return undefined
  }
  return {
    xp: { learnWord, conversationChoice, conversationWrite, eventComplete, hangulLesson, listening },
    furiganaAlwaysUntilChapter,
    initialLocations,
    startLocation,
    writeAttemptsBeforeReveal,
    hangulQuizQuestions,
    hangulPassPercent,
    listeningQuestionsPerRound,
  }
}

function loadBalance(files: FileMap, ctx: ReferenceContext, issues: ValidationIssue[]): Balance {
  const names = Object.keys(files).sort()
  const [file] = names
  if (file === undefined || names.length !== 1) {
    issues.push({ file: 'game/', index: null, id: null, path: '', message: `balance.json はちょうど1つ置いてください（${names.length}個あります）。既定の値を使います` })
    return DEFAULT_BALANCE
  }
  const errs: FieldError[] = []
  const balance = parseBalance(files[file], ctx, errs)
  for (const e of errs) issues.push({ file, index: null, id: null, path: e.path, message: e.message })
  if (balance === undefined) {
    issues.push({ file, index: null, id: null, path: '', message: '読めなかったため、既定の値を使います' })
    return DEFAULT_BALANCE
  }
  return balance
}

/**
 * イベントの前提（requires）を確かめる。存在しない・読めなかったイベントを前提にしているもの、
 * 前提が循環しているものは除外する。除外によって前提が欠けたイベントも順に除外する。
 */
function resolveEventRequirements(events: GameEvent[], issues: ValidationIssue[], fileOf: ReadonlyMap<string, string>): GameEvent[] {
  let remaining = events
  for (;;) {
    const ids = new Set(remaining.map((e) => e.id))
    const next = remaining.filter((e) => {
      const missing = e.requires.filter((r) => !ids.has(r))
      if (missing.length === 0) return true
      issues.push({ file: fileOf.get(e.id) ?? '', index: null, id: e.id, path: 'requires', message: `前提のイベントがありません（または読み込めません）：${missing.join(', ')}` })
      return false
    })
    if (next.length === remaining.length) break
    remaining = next
  }

  // 循環の検出：前提をたどって自分に戻るイベントを除外する
  const byId = new Map(remaining.map((e) => [e.id, e]))
  const inCycle = new Set<string>()
  for (const start of remaining) {
    const stack = [...start.requires]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || seen.has(id)) continue
      if (id === start.id) {
        inCycle.add(start.id)
        break
      }
      seen.add(id)
      stack.push(...(byId.get(id)?.requires ?? []))
    }
  }
  for (const id of inCycle) {
    issues.push({ file: fileOf.get(id) ?? '', index: null, id, path: 'requires', message: '前提のイベントが循環しています' })
  }
  remaining = remaining.filter((e) => !inCycle.has(e.id))
  // 循環を除いたことで前提が欠けたものも除く
  return inCycle.size > 0 ? resolveEventRequirements(remaining, issues, fileOf) : remaining
}

/** 同じ会話が複数のイベントで使われていないか（後から出てきたイベントを除外する） */
function checkConversationReuse(events: GameEvent[], issues: ValidationIssue[], fileOf: ReadonlyMap<string, string>): GameEvent[] {
  const usedBy = new Map<string, string>()
  return events.filter((e) => {
    const conv = e.steps.flatMap((s) => (s.type === 'conversation' ? [s.id] : []))
    const clash = conv.find((c) => usedBy.has(c))
    if (clash !== undefined) {
      issues.push({ file: fileOf.get(e.id) ?? '', index: null, id: e.id, path: 'steps', message: `会話 ${clash} は、すでにイベント ${usedBy.get(clash)} で使われています` })
      return false
    }
    for (const c of conv) usedBy.set(c, e.id)
    return true
  })
}

function validateKind<K extends ContentKind>(
  kind: K,
  files: FileMap,
  ctx: ReferenceContext,
  seenIds: Map<string, string>,
  issues: ValidationIssue[],
): KindItem[K][] {
  const items: KindItem[K][] = []
  for (const file of Object.keys(files).sort()) {
    const result = validateFile(kind, file, files[file], ctx)
    issues.push(...result.issues)
    for (const item of result.items) {
      const firstFile = seenIds.get(item.id)
      if (firstFile !== undefined) {
        issues.push({ file, index: null, id: item.id, path: 'id', message: `IDが重複しています（最初の定義：${firstFile}）。後から出てきた方を除外しました` })
        continue
      }
      seenIds.set(item.id, file)
      items.push(item)
    }
  }
  return items
}

/**
 * ハングルのレッスンをまたいだ確認。問題のあるレッスンは除外し、残りを order の順に並べて返す。
 * - order・字母・パッチムの字母・代表音が、ほかのレッスンと重複していないか（後から出てきた方を除外）
 * - 読む練習の単語のIDが、ほかの教材と重複していないか
 * - 聞かせる音節・単語・音の変化の例・教材の単語が、そのレッスンまでに習った文字だけで書けているか
 *   （パッチムは、パッチムのレッスンより後でだけ使える。文頭の ㅇ はいつでも使える）
 */
function checkHangulCurriculum(lessons: HangulLesson[], vocabulary: Vocab[], contentIds: Map<string, string>, issues: ValidationIssue[]): HangulLesson[] {
  const fileOf = (lesson: HangulLesson) => contentIds.get(lesson.id) ?? ''
  const issue = (lesson: HangulLesson, path: string, message: string) => issues.push({ file: fileOf(lesson), index: null, id: lesson.id, path, message })

  const sorted = [...lessons].sort((a, b) => a.order - b.order)
  const orderOwner = new Map<number, string>()
  const letterOwner = new Map<string, string>()
  const finalOwner = new Map<string, string>()
  const soundOwner = new Map<string, string>()
  const unique = sorted.filter((lesson) => {
    const clash = (owners: Map<string, string>, keys: string[], label: string) => {
      const found = keys.find((k) => owners.has(k))
      if (found !== undefined) issue(lesson, '', `${label} ${found} は、すでにレッスン ${owners.get(found)} にあります。後から出てきた方を除外しました`)
      return found !== undefined
    }
    const ownerOfOrder = orderOwner.get(lesson.order)
    if (ownerOfOrder !== undefined) {
      issue(lesson, 'order', `order ${lesson.order} は、すでにレッスン ${ownerOfOrder} で使われています。後から出てきた方を除外しました`)
      return false
    }
    const letters = lesson.letters.map((l) => l.jamo)
    const finals = lesson.finals.flatMap((f) => f.letters)
    const sounds = lesson.finals.map((f) => f.sound)
    if (clash(letterOwner, letters, '字母') || clash(finalOwner, finals, 'パッチムの字母') || clash(soundOwner, sounds, '代表音')) return false
    orderOwner.set(lesson.order, lesson.id)
    for (const k of letters) letterOwner.set(k, lesson.id)
    for (const k of finals) finalOwner.set(k, lesson.id)
    for (const k of sounds) soundOwner.set(k, lesson.id)
    return true
  })

  const vocabById = new Map(vocabulary.map((v) => [v.id, v]))
  const knownLetters = new Set<string>()
  const knownFinals = new Set<string>()
  return unique.filter((lesson) => {
    for (const l of lesson.letters) knownLetters.add(l.jamo)
    for (const f of lesson.finals) for (const k of f.letters) knownFinals.add(k)
    const known = { letters: knownLetters, finals: knownFinals }

    const texts: { path: string; korean: string }[] = [
      ...lesson.letters.flatMap((l, i) => l.sounds.map((s, j) => ({ path: `letters[${i}].sounds[${j}].korean`, korean: s.korean }))),
      ...lesson.finals.flatMap((f, i) => f.sounds.map((s, j) => ({ path: `finals[${i}].sounds[${j}].korean`, korean: s.korean }))),
      ...lesson.words.map((w, i) => ({ path: `words[${i}].korean`, korean: w.korean })),
      ...lesson.rules.flatMap((r, i) => r.examples.map((e, j) => ({ path: `rules[${i}].examples[${j}].korean`, korean: e.korean }))),
      ...lesson.vocabulary.flatMap((id) => {
        const v = vocabById.get(id)
        return v === undefined ? [] : [{ path: `vocabulary（${id}）`, korean: v.korean }]
      }),
    ]
    let ok = true
    for (const { path, korean } of texts) {
      const missing = unlearnedJamo(korean, known)
      if (missing.letters.length > 0) {
        issue(lesson, path, `「${korean}」に、このレッスンまでに習っていない字母があります：${missing.letters.join(' ')}`)
        ok = false
      }
      if (missing.finals.length > 0) {
        const message =
          knownFinals.size === 0
            ? `「${korean}」はパッチムのある言葉です。パッチムのレッスンより後のレッスンで使ってください`
            : `「${korean}」に、パッチムのレッスンで習っていないパッチムがあります：${missing.finals.join(' ')}（finals の letters に入れてください）`
        issue(lesson, path, message)
        ok = false
      }
    }
    for (const [i, w] of lesson.words.entries()) {
      const owner = contentIds.get(w.id)
      if (owner !== undefined) {
        issue(lesson, `words[${i}].id`, `IDが重複しています（最初の定義：${owner}）`)
        ok = false
      } else {
        contentIds.set(w.id, fileOf(lesson))
      }
    }
    return ok
  })
}

/** 施設・キャラクター・教材・イベント・調整値をまとめて検証する。問題のあるデータは除外して返す */
export function loadContent(input: ContentInput): LoadedContent {
  const issues: ValidationIssue[] = []
  const emptyCtx = emptyReferenceContext()

  const locations = validateKind('locations', input.locations, emptyCtx, new Map(), issues)
  const characters = validateKind('characters', input.characters, emptyCtx, new Map(), issues)
  const baseCtx: ReferenceContext = {
    ...emptyCtx,
    locationIds: new Set(locations.map((l) => l.id)),
    characterIds: new Set(characters.map((c) => c.id)),
  }

  // 教材のIDは種類をまたいで一意にする（学習記録が ID だけで参照するため）
  const contentIds = new Map<string, string>()
  const vocabulary = validateKind('vocabulary', input.vocabulary, baseCtx, contentIds, issues)
  const grammar = validateKind('grammar', input.grammar, baseCtx, contentIds, issues)
  const conversations = validateKind('conversations', input.conversations, baseCtx, contentIds, issues)
  const columns = validateKind('columns', input.columns, baseCtx, contentIds, issues)

  const ctx: ReferenceContext = {
    ...baseCtx,
    vocabularyIds: new Set(vocabulary.map((v) => v.id)),
    grammarIds: new Set(grammar.map((g) => g.id)),
    conversationLocations: new Map(conversations.map((c) => [c.id, c.location])),
    columnIds: new Set(columns.map((c) => c.id)),
  }
  const eventFiles = new Map<string, string>()
  const parsedEvents = validateKind('events', input.events, ctx, eventFiles, issues)
  const events = checkConversationReuse(resolveEventRequirements(parsedEvents, issues, eventFiles), issues, eventFiles)
  const parsedLessons = validateKind('hangulLessons', input.hangulLessons, ctx, contentIds, issues)
  const hangulLessons = checkHangulCurriculum(parsedLessons, vocabulary, contentIds, issues)
  const listening = validateKind('listening', input.listening, { ...ctx, eventIds: new Set(events.map((e) => e.id)) }, contentIds, issues)
  const drills = checkDrillItemIds(validateKind('drills', input.drills, ctx, contentIds, issues), contentIds, issues)
  const parsedTests = validateKind('chapterTests', input.chapterTests, ctx, contentIds, issues)
  const chapterTests = checkOneTestPerChapter(checkDrillItemIds(parsedTests, contentIds, issues), contentIds, issues).sort((a, b) => a.chapter - b.chapter)
  const balance = loadBalance(input.balance, ctx, issues)

  return { vocabulary, grammar, conversations, columns, events, locations, characters, hangulLessons, listening, drills, chapterTests, balance, issues }
}

/** 問題を1行の文章にする（コンソール表示用） */
export function formatIssue(issue: ValidationIssue): string {
  const where = [issue.file, issue.index === null ? null : `${issue.index}番目`, issue.id, issue.path || null].filter((s) => s !== null).join(' / ')
  return `${where}: ${issue.message}`
}
