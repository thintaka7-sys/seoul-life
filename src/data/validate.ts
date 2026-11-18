// 教材データ・ゲームデータの検証。
// JSON は形が保証されないため unknown として受け取り、1項目ずつ確かめてから型付きのデータにする。
// 問題のあるデータは除外し、問題の一覧（ValidationIssue）を返す。例外は投げない。

import {
  EVENT_STEP_TYPES,
  ID_PATTERNS,
  PARTS_OF_SPEECH,
  PLAYER_SPEAKER_ID,
  VOCAB_CATEGORIES,
  type Balance,
  type Character,
  type Conversation,
  type ConversationChoice,
  type ConversationLine,
  type EventStep,
  type FreeAnswer,
  type GameEvent,
  type Grammar,
  type GrammarExample,
  type Location,
  type ValidationIssue,
  type Vocab,
} from './types'

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
}

export function emptyReferenceContext(): ReferenceContext {
  return { locationIds: new Set(), characterIds: new Set(), vocabularyIds: new Set(), grammarIds: new Set(), conversationLocations: new Map() }
}

export type ContentKind = 'vocabulary' | 'grammar' | 'conversations' | 'events' | 'locations' | 'characters'

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
  'category',
  'level',
  'example',
  'examplePronunciation',
  'exampleJapanese',
  'reviewed',
  'notes',
] as const

function parseVocab(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Vocab | undefined {
  checkKnownKeys(o, VOCAB_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.vocabulary, 'vocab_001', errs)
  const korean = text(o, 'korean', '', errs)
  const alternatives = textArray(o, 'alternatives', '', errs, { optional: true, min: 1 })
  const pronunciation = reading(o, 'pronunciation', '', errs, korean)
  const japanese = text(o, 'japanese', '', errs)
  const partOfSpeech = oneOf(o, 'partOfSpeech', '', errs, PARTS_OF_SPEECH)
  const category = oneOf(o, 'category', '', errs, VOCAB_CATEGORIES)
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
    category === undefined ||
    level === undefined ||
    reviewed === undefined
  ) {
    return undefined
  }
  const vocab: Vocab = { id, korean, pronunciation, japanese, partOfSpeech, category, level, reviewed }
  if (alternatives !== undefined) vocab.alternatives = alternatives
  if (example !== undefined && examplePronunciation !== undefined && exampleJapanese !== undefined) {
    vocab.example = example
    vocab.examplePronunciation = examplePronunciation
    vocab.exampleJapanese = exampleJapanese
  }
  if (notes !== undefined) vocab.notes = notes
  return vocab
}

const GRAMMAR_KEYS = ['id', 'title', 'level', 'explanation', 'examples', 'reviewed', 'notes'] as const
const GRAMMAR_EXAMPLE_KEYS = ['korean', 'pronunciation', 'japanese', 'alternatives'] as const

function parseGrammar(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Grammar | undefined {
  checkKnownKeys(o, GRAMMAR_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.grammar, 'grammar_001', errs)
  const title = text(o, 'title', '', errs)
  const level = integer(o, 'level', '', errs, 1)
  const explanation = text(o, 'explanation', '', errs)
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
    if (korean === undefined || pronunciation === undefined || japanese === undefined) continue
    const ex: GrammarExample = { korean, pronunciation, japanese }
    if (alternatives !== undefined) ex.alternatives = alternatives
    examples.push(ex)
  }

  if (errs.length > 0 || id === undefined || title === undefined || level === undefined || explanation === undefined || reviewed === undefined) {
    return undefined
  }
  const grammar: Grammar = { id, title, level, explanation, examples, reviewed }
  if (notes !== undefined) grammar.notes = notes
  return grammar
}

const CONVERSATION_KEYS = ['id', 'chapter', 'location', 'character', 'lines', 'choices', 'freeAnswer', 'reviewed', 'notes'] as const
const LINE_KEYS = ['speaker', 'korean', 'pronunciation', 'japanese'] as const
const CHOICE_KEYS = ['korean', 'pronunciation', 'japanese', 'correct'] as const
const FREE_ANSWER_KEYS = ['prompt', 'answers'] as const

function parseConversation(o: Obj, ctx: ReferenceContext, errs: FieldError[]): Conversation | undefined {
  checkKnownKeys(o, CONVERSATION_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.conversation, 'cafe_001', errs)
  const chapter = integer(o, 'chapter', '', errs, 1, MAX_CHAPTER)
  const location = reference(o, 'location', '', errs, ctx.locationIds, '施設ID')
  const character = reference(o, 'character', '', errs, ctx.characterIds, 'キャラクターID')
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  const speakerIds = new Set([...ctx.characterIds, PLAYER_SPEAKER_ID])

  const lines: ConversationLine[] = []
  for (const { value, path } of objArray(o, 'lines', '', errs, 1) ?? []) {
    checkKnownKeys(value, LINE_KEYS, path, errs)
    const speaker = reference(value, 'speaker', path, errs, speakerIds, '話者ID')
    const korean = text(value, 'korean', path, errs)
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    const japanese = text(value, 'japanese', path, errs)
    if (speaker !== undefined && korean !== undefined && pronunciation !== undefined && japanese !== undefined) {
      lines.push({ speaker, korean, pronunciation, japanese })
    }
  }

  const choices: ConversationChoice[] = []
  const choiceItems = objArray(o, 'choices', '', errs, 1)
  for (const { value, path } of choiceItems ?? []) {
    checkKnownKeys(value, CHOICE_KEYS, path, errs)
    const korean = text(value, 'korean', path, errs)
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    const japanese = text(value, 'japanese', path, errs)
    const correct = bool(value, 'correct', path, errs)
    if (korean !== undefined && pronunciation !== undefined && japanese !== undefined && correct !== undefined) {
      choices.push({ korean, pronunciation, japanese, correct })
    }
  }
  const allChoicesBoolean = choiceItems?.every(({ value }) => typeof value['correct'] === 'boolean') ?? false
  if (choiceItems !== undefined && choiceItems.length > 0 && allChoicesBoolean && !choiceItems.some(({ value }) => value['correct'] === true)) {
    errs.push({ path: 'choices', message: '"correct": true の選択肢を1つ以上入れてください' })
  }
  if (new Set(choices.map((c) => c.korean)).size !== choices.length) {
    errs.push({ path: 'choices', message: '同じ韓国語の選択肢が重複しています' })
  }

  let freeAnswer: FreeAnswer | undefined
  const rawFree = o['freeAnswer']
  if (rawFree !== undefined) {
    if (!isObj(rawFree)) {
      errs.push({ path: 'freeAnswer', message: 'オブジェクト（{ }）にしてください' })
    } else {
      checkKnownKeys(rawFree, FREE_ANSWER_KEYS, 'freeAnswer', errs)
      const prompt = text(rawFree, 'prompt', 'freeAnswer', errs)
      const answers = textArray(rawFree, 'answers', 'freeAnswer', errs, { optional: false, min: 1 })
      if (prompt !== undefined && answers !== undefined) freeAnswer = { prompt, answers }
    }
  }

  if (errs.length > 0 || id === undefined || chapter === undefined || location === undefined || character === undefined || reviewed === undefined) {
    return undefined
  }
  const conversation: Conversation = { id, chapter, location, character, lines, choices, reviewed }
  if (freeAnswer !== undefined) conversation.freeAnswer = freeAnswer
  if (notes !== undefined) conversation.notes = notes
  return conversation
}

function parseLocation(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Location | undefined {
  checkKnownKeys(o, ['id', 'nameJa'], '', errs)
  const id = idField(o, ID_PATTERNS.key, 'cafe', errs)
  const nameJa = text(o, 'nameJa', '', errs)
  if (errs.length > 0 || id === undefined || nameJa === undefined) return undefined
  return { id, nameJa }
}

function parseCharacter(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Character | undefined {
  checkKnownKeys(o, ['id', 'roleJa'], '', errs)
  const id = idField(o, ID_PATTERNS.key, 'cafe_staff', errs)
  const roleJa = text(o, 'roleJa', '', errs)
  if (id === PLAYER_SPEAKER_ID) errs.push({ path: 'id', message: `"${PLAYER_SPEAKER_ID}" は主人公用に予約されています` })
  if (errs.length > 0 || id === undefined || roleJa === undefined) return undefined
  return { id, roleJa }
}

const EVENT_KEYS = ['id', 'chapter', 'location', 'requires', 'objectiveJa', 'actionJa', 'steps', 'notes'] as const
const STEP_KEYS: Record<EventStep['type'], readonly string[]> = {
  message: ['type', 'textJa'],
  learn: ['type', 'vocabulary', 'grammar'],
  conversation: ['type', 'id'],
  dictionary: ['type', 'textJa'],
  dayEnd: ['type', 'textJa'],
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
  events: parseEvent,
  locations: parseLocation,
  characters: parseCharacter,
} as const

interface KindItem {
  vocabulary: Vocab
  grammar: Grammar
  conversations: Conversation
  events: GameEvent
  locations: Location
  characters: Character
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
  events: FileMap
  locations: FileMap
  characters: FileMap
  /** ゲームの調整用の数値。ファイルは1つだけ置く */
  balance: FileMap
}

export interface LoadedContent {
  vocabulary: Vocab[]
  grammar: Grammar[]
  conversations: Conversation[]
  /** ファイル内の順番どおり。同じ施設で行えるイベントが複数あれば、先のものから行う */
  events: GameEvent[]
  locations: Location[]
  characters: Character[]
  balance: Balance
  issues: ValidationIssue[]
}

/** balance.json が読めなかったときに使う値（ゲームを止めないため） */
export const DEFAULT_BALANCE: Balance = {
  xp: { learnWord: 2, conversationChoice: 10, conversationWrite: 15, eventComplete: 20 },
  furiganaAlwaysUntilChapter: 3,
  initialLocations: ['home', 'cafe'],
  startLocation: 'home',
  writeAttemptsBeforeReveal: 2,
}

const BALANCE_KEYS = ['xp', 'furiganaAlwaysUntilChapter', 'initialLocations', 'startLocation', 'writeAttemptsBeforeReveal'] as const
const XP_KEYS = ['learnWord', 'conversationChoice', 'conversationWrite', 'eventComplete'] as const

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
  if (startLocation !== undefined && initialLocations !== undefined && !initialLocations.includes(startLocation)) {
    errs.push({ path: 'startLocation', message: 'startLocation は initialLocations に含めてください' })
  }
  const { learnWord, conversationChoice, conversationWrite, eventComplete } = xp
  if (
    errs.length > 0 ||
    learnWord === undefined ||
    conversationChoice === undefined ||
    conversationWrite === undefined ||
    eventComplete === undefined ||
    furiganaAlwaysUntilChapter === undefined ||
    initialLocations === undefined ||
    startLocation === undefined ||
    writeAttemptsBeforeReveal === undefined
  ) {
    return undefined
  }
  return {
    xp: { learnWord, conversationChoice, conversationWrite, eventComplete },
    furiganaAlwaysUntilChapter,
    initialLocations,
    startLocation,
    writeAttemptsBeforeReveal,
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

  const ctx: ReferenceContext = {
    ...baseCtx,
    vocabularyIds: new Set(vocabulary.map((v) => v.id)),
    grammarIds: new Set(grammar.map((g) => g.id)),
    conversationLocations: new Map(conversations.map((c) => [c.id, c.location])),
  }
  const eventFiles = new Map<string, string>()
  const parsedEvents = validateKind('events', input.events, ctx, eventFiles, issues)
  const events = checkConversationReuse(resolveEventRequirements(parsedEvents, issues, eventFiles), issues, eventFiles)
  const balance = loadBalance(input.balance, ctx, issues)

  return { vocabulary, grammar, conversations, events, locations, characters, balance, issues }
}

/** 問題を1行の文章にする（コンソール表示用） */
export function formatIssue(issue: ValidationIssue): string {
  const where = [issue.file, issue.index === null ? null : `${issue.index}番目`, issue.id, issue.path || null].filter((s) => s !== null).join(' / ')
  return `${where}: ${issue.message}`
}
