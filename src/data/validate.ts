// 教材データ・ゲームデータの検証。
// JSON は形が保証されないため unknown として受け取り、1項目ずつ確かめてから型付きのデータにする。
// 問題のあるデータは除外し、問題の一覧（ValidationIssue）を返す。例外は投げない。

import {
  ID_PATTERNS,
  PARTS_OF_SPEECH,
  PLAYER_SPEAKER_ID,
  VOCAB_CATEGORIES,
  type Character,
  type Conversation,
  type ConversationChoice,
  type ConversationLine,
  type FreeAnswer,
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
}

export type ContentKind = 'vocabulary' | 'grammar' | 'conversations' | 'locations' | 'characters'

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
  'exampleJapanese',
  'reviewed',
  'notes',
] as const

function parseVocab(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Vocab | undefined {
  checkKnownKeys(o, VOCAB_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.vocabulary, 'vocab_001', errs)
  const korean = text(o, 'korean', '', errs)
  const alternatives = textArray(o, 'alternatives', '', errs, { optional: true, min: 1 })
  const pronunciation = text(o, 'pronunciation', '', errs)
  const japanese = text(o, 'japanese', '', errs)
  const partOfSpeech = oneOf(o, 'partOfSpeech', '', errs, PARTS_OF_SPEECH)
  const category = oneOf(o, 'category', '', errs, VOCAB_CATEGORIES)
  const level = integer(o, 'level', '', errs, 1)
  const example = optionalText(o, 'example', '', errs)
  const exampleJapanese = optionalText(o, 'exampleJapanese', '', errs)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)

  if ((o['example'] === undefined) !== (o['exampleJapanese'] === undefined)) {
    errs.push({ path: 'example', message: 'example と exampleJapanese は両方書くか、両方省いてください' })
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
  if (example !== undefined) vocab.example = example
  if (exampleJapanese !== undefined) vocab.exampleJapanese = exampleJapanese
  if (notes !== undefined) vocab.notes = notes
  return vocab
}

const GRAMMAR_KEYS = ['id', 'title', 'level', 'explanation', 'examples', 'reviewed', 'notes'] as const
const GRAMMAR_EXAMPLE_KEYS = ['korean', 'japanese', 'alternatives'] as const

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
    const japanese = text(value, 'japanese', path, errs)
    const alternatives = textArray(value, 'alternatives', path, errs, { optional: true, min: 1 })
    if (korean !== undefined && alternatives?.includes(korean)) {
      errs.push({ path: joinPath(path, 'alternatives'), message: 'korean と同じ文字列は alternatives に入れないでください' })
    }
    if (korean === undefined || japanese === undefined) continue
    const ex: GrammarExample = { korean, japanese }
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
const LINE_KEYS = ['speaker', 'korean', 'japanese'] as const
const CHOICE_KEYS = ['korean', 'japanese', 'correct'] as const
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
    const japanese = text(value, 'japanese', path, errs)
    if (speaker !== undefined && korean !== undefined && japanese !== undefined) lines.push({ speaker, korean, japanese })
  }

  const choices: ConversationChoice[] = []
  const choiceItems = objArray(o, 'choices', '', errs, 1)
  for (const { value, path } of choiceItems ?? []) {
    checkKnownKeys(value, CHOICE_KEYS, path, errs)
    const korean = text(value, 'korean', path, errs)
    const japanese = text(value, 'japanese', path, errs)
    const correct = bool(value, 'correct', path, errs)
    if (korean !== undefined && japanese !== undefined && correct !== undefined) choices.push({ korean, japanese, correct })
  }
  if (choiceItems !== undefined && choiceItems.length > 0 && choices.length === choiceItems.length && !choices.some((c) => c.correct)) {
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
  locations: parseLocation,
  characters: parseCharacter,
} as const

interface KindItem {
  vocabulary: Vocab
  grammar: Grammar
  conversations: Conversation
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
  locations: FileMap
  characters: FileMap
}

export interface LoadedContent {
  vocabulary: Vocab[]
  grammar: Grammar[]
  conversations: Conversation[]
  locations: Location[]
  characters: Character[]
  issues: ValidationIssue[]
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

/** 施設・キャラクター・教材をまとめて検証する。問題のあるデータは除外して返す */
export function loadContent(input: ContentInput): LoadedContent {
  const issues: ValidationIssue[] = []
  const emptyCtx: ReferenceContext = { locationIds: new Set(), characterIds: new Set() }

  const locations = validateKind('locations', input.locations, emptyCtx, new Map(), issues)
  const characters = validateKind('characters', input.characters, emptyCtx, new Map(), issues)
  const ctx: ReferenceContext = {
    locationIds: new Set(locations.map((l) => l.id)),
    characterIds: new Set(characters.map((c) => c.id)),
  }

  // 教材のIDは種類をまたいで一意にする（学習記録が ID だけで参照するため）
  const contentIds = new Map<string, string>()
  const vocabulary = validateKind('vocabulary', input.vocabulary, ctx, contentIds, issues)
  const grammar = validateKind('grammar', input.grammar, ctx, contentIds, issues)
  const conversations = validateKind('conversations', input.conversations, ctx, contentIds, issues)

  return { vocabulary, grammar, conversations, locations, characters, issues }
}

/** 問題を1行の文章にする（コンソール表示用） */
export function formatIssue(issue: ValidationIssue): string {
  const where = [issue.file, issue.index === null ? null : `${issue.index}番目`, issue.id, issue.path || null].filter((s) => s !== null).join(' / ')
  return `${where}: ${issue.message}`
}
