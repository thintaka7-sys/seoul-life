// 教材データ・ゲームデータの検証。
// JSON は形が保証されないため unknown として受け取り、1項目ずつ確かめてから型付きのデータにする。
// 問題のあるデータは除外し、問題の一覧（ValidationIssue）を返す。例外は投げない。

import {
  ACHIEVEMENT_CONDITIONS,
  BGM_IDS,
  COLUMN_BLOCK_TYPES,
  FIGURE_ARROWS,
  FIGURE_TYPES,
  FORM_KINDS,
  FIGURE_IMAGES,
  FIND_PLACES,
  MENU_DISPLAYS,
  MENU_IMAGES,
  READING_QUESTION_TYPES,
  READING_STYLES,
  SCENE_SOUNDS,
  STORY_BEAT_TYPES,
  EAR_ITEMS_MAX,
  EAR_ITEMS_MIN,
  EAR_THEMES,
  EVENT_STEP_TYPES,
  SCENE_BACKGROUNDS,
  EXPRESSIONS,
  HANGUL_LESSON_KINDS,
  ID_PATTERNS,
  PARTS_OF_SPEECH,
  PLAYER_SPEAKER_ID,
  STAMP_ACTIVITIES,
  VOCAB_GENRES,
  type Achievement,
  type Furniture,
  type Room,
  type RoomOccluder,
  type RoomSlot,
  type Balance,
  type Chapter,
  type ChapterTest,
  type CompareItem,
  type Figure,
  type FigureLabel,
  type FigureType,
  type Gloss,
  type Menu,
  type MenuItem,
  type Order,
  type OrderCount,
  type OrderEnding,
  type OrderModifier,
  type Reading,
  type ReadingChoice,
  type FindPlace,
  type ReadingLine,
  type ReadingQuestion,
  type Story,
  type StoryBeat,
  type StoryChoice,
  type VocabBase,
  type VocabForm,
  type Character,
  type CharacterName,
  type Column,
  type ColumnBlock,
  type Conversation,
  type Drill,
  type DrillItem,
  type EarItem,
  type EarSet,
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
  type StampActivity,
  type Vocab,
} from './types'
import { normalizeAnswer } from '../learning/judge/judgeAnswer'
import { findChunkSequence, textChunks } from '../learning/gloss/chunks'
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
  /** 単語ID → 韓国語（読み物の「探して押す」問題で、メニューの品名を確かめる） */
  vocabKorean: ReadonlyMap<string, string>
  storyIds: ReadonlySet<string>
  readingIds: ReadonlySet<string>
  /** 注文ID → 施設ID */
  orderLocations: ReadonlyMap<string, string>
  menus: ReadonlyMap<string, Menu>
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
    vocabKorean: new Map(),
    storyIds: new Set(),
    readingIds: new Set(),
    orderLocations: new Map(),
    menus: new Map(),
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
  | 'earSets'
  | 'stories'
  | 'readings'
  | 'menus'
  | 'orders'

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

/** 英小文字のキー（例：americano、mouth_eo） */
function keyField(o: Obj, key: string, base: string, errs: FieldError[]): string | undefined {
  const v = text(o, key, base, errs)
  if (v === undefined) return undefined
  if (!ID_PATTERNS.key.test(v)) {
    errs.push({ path: joinPath(base, key), message: '英小文字・数字・_ のキーにしてください（例：mouth_eo）' })
    return undefined
  }
  return v
}

/** null を書ける項目。書いていなければ undefined、null なら null、それ以外は parse の結果 */
function nullable<T>(o: Obj, key: string, parse: () => T | undefined): T | null | undefined {
  if (!(key in o)) return undefined
  if (o[key] === null) return null
  return parse()
}

// ---------- タップで意味を見る語句（glosses。GAME_SPEC 4-8） ----------

const GLOSS_KEYS = ['text', 'vocab', 'pronunciation', 'japanese', 'noteJa'] as const

/** korean（台詞・本文）に付けた glosses。書いていなければ undefined */
function parseGlosses(o: Obj, base: string, korean: string | undefined, ctx: ReferenceContext, errs: FieldError[]): Gloss[] | undefined {
  if (o['glosses'] === undefined) return undefined
  const items = objArray(o, 'glosses', base, errs, 1)
  if (items === undefined) return undefined
  const glosses: Gloss[] = []
  for (const { value, path } of items) {
    checkKnownKeys(value, GLOSS_KEYS, path, errs)
    const t = text(value, 'text', path, errs)
    if (t !== undefined) {
      if (textChunks(t).join(' ') !== t) {
        errs.push({ path: joinPath(path, 'text'), message: '句読点を付けず、空白1つで区切って書いてください（例：이름이、만나서 반갑습니다）' })
      } else if (korean !== undefined && findChunkSequence(korean, t) < 0) {
        errs.push({ path: joinPath(path, 'text'), message: `「${t}」が、文の中に空白で区切ったまとまりのままありません（まとまりの一部だけは指せません）` })
      }
    }
    const hasVocab = value['vocab'] !== undefined
    const vocab = hasVocab ? reference(value, 'vocab', path, errs, ctx.vocabularyIds, '単語ID') : undefined
    let pronunciation: string | undefined
    let japanese: string | undefined
    if (hasVocab) {
      if (value['pronunciation'] !== undefined || value['japanese'] !== undefined) {
        errs.push({ path, message: 'vocab を書いたときは、読み・意味は単語の教材から出すので、pronunciation・japanese は書かないでください' })
      }
    } else {
      pronunciation = reading(value, 'pronunciation', path, errs, t)
      japanese = text(value, 'japanese', path, errs)
    }
    const noteJa = optionalText(value, 'noteJa', path, errs)
    if (t === undefined) continue
    const gloss: Gloss = { text: t }
    if (vocab !== undefined) gloss.vocab = vocab
    if (pronunciation !== undefined) gloss.pronunciation = pronunciation
    if (japanese !== undefined) gloss.japanese = japanese
    if (noteJa !== undefined) gloss.noteJa = noteJa
    glosses.push(gloss)
  }
  if (new Set(glosses.map((g) => g.text)).size !== glosses.length) {
    errs.push({ path: joinPath(base, 'glosses'), message: '同じ語句（text）が重複しています' })
  }
  return glosses
}

// ---------- 図と絵（figures。GAME_SPEC 4-11） ----------

const FIGURE_KEYS: Record<FigureType, readonly string[]> = {
  image: ['type', 'image', 'captionJa', 'labels'],
  formation: ['type', 'parts', 'result', 'resultPronunciation', 'noteJa'],
  syllable: ['type', 'korean', 'noteJa'],
  compare: ['type', 'items', 'captionJa'],
}
const FIGURE_LABEL_KEYS = ['x', 'y', 'textJa', 'arrow'] as const
const COMPARE_ITEM_KEYS = ['korean', 'pronunciation', 'image', 'noteJa'] as const
const SYLLABLE = /^[가-힣]$/
const COMPARE_MIN = 2
const COMPARE_MAX = 3

function parseFigure(value: Obj, path: string, errs: FieldError[]): Figure | undefined {
  const type = oneOf(value, 'type', path, errs, FIGURE_TYPES)
  if (type === undefined) return undefined
  checkKnownKeys(value, FIGURE_KEYS[type], path, errs)
  switch (type) {
    case 'image': {
      const image = oneOf(value, 'image', path, errs, FIGURE_IMAGES)
      const captionJa = optionalText(value, 'captionJa', path, errs)
      let labels: FigureLabel[] | undefined
      if (value['labels'] !== undefined) {
        labels = []
        for (const { value: l, path: lPath } of objArray(value, 'labels', path, errs, 1) ?? []) {
          checkKnownKeys(l, FIGURE_LABEL_KEYS, lPath, errs)
          const x = percent(l, 'x', lPath, errs)
          const y = percent(l, 'y', lPath, errs)
          const textJa = text(l, 'textJa', lPath, errs)
          const arrow = l['arrow'] === undefined ? undefined : oneOf(l, 'arrow', lPath, errs, FIGURE_ARROWS)
          if (x === undefined || y === undefined || textJa === undefined) continue
          const label: FigureLabel = { x, y, textJa }
          if (arrow !== undefined) label.arrow = arrow
          labels.push(label)
        }
      }
      if (image === undefined) return undefined
      const fig: Figure = { type, image }
      if (captionJa !== undefined) fig.captionJa = captionJa
      if (labels !== undefined) fig.labels = labels
      return fig
    }
    case 'formation': {
      const parts = textArray(value, 'parts', path, errs, { optional: false, min: 2 })
      const result = text(value, 'result', path, errs)
      const resultPronunciation = value['resultPronunciation'] === undefined ? undefined : reading(value, 'resultPronunciation', path, errs, result)
      const noteJa = optionalText(value, 'noteJa', path, errs)
      if (parts === undefined || result === undefined) return undefined
      const fig: Figure = { type, parts, result }
      if (resultPronunciation !== undefined) fig.resultPronunciation = resultPronunciation
      if (noteJa !== undefined) fig.noteJa = noteJa
      return fig
    }
    case 'syllable': {
      const korean = text(value, 'korean', path, errs)
      const noteJa = optionalText(value, 'noteJa', path, errs)
      if (korean === undefined) return undefined
      if (!SYLLABLE.test(korean)) {
        errs.push({ path: joinPath(path, 'korean'), message: 'ハングルの1音節（例：한）にしてください' })
        return undefined
      }
      const fig: Figure = { type, korean }
      if (noteJa !== undefined) fig.noteJa = noteJa
      return fig
    }
    case 'compare': {
      const items: CompareItem[] = []
      for (const { value: it, path: itPath } of objArray(value, 'items', path, errs, COMPARE_MIN) ?? []) {
        checkKnownKeys(it, COMPARE_ITEM_KEYS, itPath, errs)
        const korean = text(it, 'korean', itPath, errs)
        const pronunciation = reading(it, 'pronunciation', itPath, errs, korean)
        const image = it['image'] === undefined ? undefined : oneOf(it, 'image', itPath, errs, FIGURE_IMAGES)
        const noteJa = optionalText(it, 'noteJa', itPath, errs)
        if (korean === undefined || pronunciation === undefined) continue
        const item: CompareItem = { korean, pronunciation }
        if (image !== undefined) item.image = image
        if (noteJa !== undefined) item.noteJa = noteJa
        items.push(item)
      }
      if (Array.isArray(value['items']) && value['items'].length > COMPARE_MAX) {
        errs.push({ path: joinPath(path, 'items'), message: `比べるものは ${COMPARE_MIN}〜${COMPARE_MAX} 個にしてください` })
      }
      const captionJa = optionalText(value, 'captionJa', path, errs)
      const fig: Figure = { type, items }
      if (captionJa !== undefined) fig.captionJa = captionJa
      return fig
    }
  }
}

/** 図や絵の配列（figures）。書いていなければ undefined */
function parseFigures(o: Obj, base: string, errs: FieldError[]): Figure[] | undefined {
  if (o['figures'] === undefined) return undefined
  const figures: Figure[] = []
  for (const { value, path } of objArray(o, 'figures', base, errs, 1) ?? []) {
    const fig = parseFigure(value, path, errs)
    if (fig !== undefined) figures.push(fig)
  }
  return figures
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
  'base',
  'forms',
  'reviewed',
  'notes',
] as const
const VOCAB_BASE_KEYS = ['korean', 'pronunciation', 'japanese'] as const
const VOCAB_FORM_KEYS = ['kind', 'korean', 'pronunciation', 'parts', 'wrong', 'noteJa'] as const

/** 元の形（base）と形が変わった言葉（forms）。GAME_SPEC 4-3 */
function parseVocabForms(o: Obj, headword: string | undefined, errs: FieldError[]): { base?: VocabBase; forms?: VocabForm[] } {
  const result: { base?: VocabBase; forms?: VocabForm[] } = {}
  const rawBase = o['base']
  if (rawBase !== undefined) {
    if (!isObj(rawBase)) {
      errs.push({ path: 'base', message: 'オブジェクト（{ }）にしてください' })
    } else {
      checkKnownKeys(rawBase, VOCAB_BASE_KEYS, 'base', errs)
      const korean = koreanText(rawBase, 'korean', 'base', errs)
      const pronunciation = reading(rawBase, 'pronunciation', 'base', errs, korean)
      const japanese = optionalText(rawBase, 'japanese', 'base', errs)
      if (korean !== undefined && korean === headword) errs.push({ path: 'base.korean', message: '見出し語が元の形のときは、base を書かないでください' })
      if (korean !== undefined && pronunciation !== undefined) {
        result.base = { korean, pronunciation }
        if (japanese !== undefined) result.base.japanese = japanese
      }
    }
  }
  if (o['forms'] !== undefined) {
    const forms: VocabForm[] = []
    for (const { value, path } of objArray(o, 'forms', '', errs, 1) ?? []) {
      checkKnownKeys(value, VOCAB_FORM_KEYS, path, errs)
      const kind = oneOf(value, 'kind', path, errs, FORM_KINDS)
      const korean = koreanText(value, 'korean', path, errs)
      const pronunciation = reading(value, 'pronunciation', path, errs, korean)
      const parts = textArray(value, 'parts', path, errs, { optional: false, min: 2 })
      const wrong = textArray(value, 'wrong', path, errs, { optional: true, min: 1 })
      const noteJa = optionalText(value, 'noteJa', path, errs)
      if (korean !== undefined && wrong?.includes(korean)) errs.push({ path: joinPath(path, 'wrong'), message: 'くっついた形（korean）と同じものは wrong に入れないでください' })
      if (kind === undefined || korean === undefined || pronunciation === undefined || parts === undefined) continue
      const form: VocabForm = { kind, korean, pronunciation, parts }
      if (wrong !== undefined) form.wrong = wrong
      if (noteJa !== undefined) form.noteJa = noteJa
      forms.push(form)
    }
    if (new Set(forms.map((f) => f.korean)).size !== forms.length) errs.push({ path: 'forms', message: '同じ形（korean）が重複しています' })
    result.forms = forms
  }
  return result
}

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
  const { base, forms } = parseVocabForms(o, korean, errs)

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
  if (base !== undefined) vocab.base = base
  if (forms !== undefined) vocab.forms = forms
  if (notes !== undefined) vocab.notes = notes
  return vocab
}

const GRAMMAR_KEYS = ['id', 'title', 'level', 'explanation', 'connectionJa', 'examples', 'figures', 'reviewed', 'notes'] as const
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
  const figures = parseFigures(o, '', errs)
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
  if (figures !== undefined) grammar.figures = figures
  if (notes !== undefined) grammar.notes = notes
  return grammar
}

const CONVERSATION_KEYS = ['id', 'chapter', 'location', 'character', 'turns', 'reviewed', 'notes'] as const
const TURN_KEYS = ['kind', 'task', 'lines', 'choices', 'freeAnswer'] as const

/**
 * 往復の種類。
 * - question：問題（正解が1つ。task が必須）
 * - decision：選択（正解・不正解を付けない）
 */
type TurnMode = 'question' | 'decision'
const LINE_KEYS = ['speaker', 'korean', 'pronunciation', 'japanese', 'expression', 'glosses'] as const
const CHOICE_KEYS = ['korean', 'pronunciation', 'japanese', 'correct', 'reply'] as const
const FREE_ANSWER_KEYS = ['prompt', 'answers', 'reply'] as const

/** 台詞1つ。allowed は書ける項目（おはなしの段階では type も書ける） */
function parseLine(value: Obj, path: string, ctx: ReferenceContext, errs: FieldError[], allowed: readonly string[] = LINE_KEYS): ConversationLine | undefined {
  const speakerIds = new Set([...ctx.characterIds, PLAYER_SPEAKER_ID])
  checkKnownKeys(value, allowed, path, errs)
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
  const glosses = parseGlosses(value, path, korean, ctx, errs)
  if (speaker === undefined || korean === undefined || pronunciation === undefined || japanese === undefined) return undefined
  const line: ConversationLine = { speaker, korean, pronunciation, japanese }
  if (expression !== undefined) line.expression = expression
  if (glosses !== undefined) line.glosses = glosses
  return line
}

/** 台詞の配列（lines・reply）。min 個以上 */
function parseLines(o: Obj, key: string, base: string, ctx: ReferenceContext, errs: FieldError[], min: number): ConversationLine[] | undefined {
  const items = objArray(o, key, base, errs, min)
  if (items === undefined) return undefined
  const lines: ConversationLine[] = []
  for (const { value, path } of items) {
    const line = parseLine(value, path, ctx, errs)
    if (line !== undefined) lines.push(line)
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
  const mode: TurnMode = decision ? 'decision' : 'question'
  // 問題の往復では「言うこと」（task）が必須（GAME_SPEC 4-4）。選択の往復では任意。締めの台詞には書けない（下で確かめる）
  const task = value['task'] === undefined && (decision || !hasChoices) ? undefined : japaneseText(value, 'task', path, errs)
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
  checkKnownKeys(o, ['id', 'nameJa', 'mapArea', 'bgm'], '', errs)
  const bgm = o['bgm'] === undefined ? undefined : oneOf(o, 'bgm', '', errs, BGM_IDS)
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
  if (bgm !== undefined) location.bgm = bgm
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

const EVENT_KEYS = ['id', 'chapter', 'location', 'requires', 'objectiveJa', 'actionJa', 'start', 'unlocks', 'steps', 'notes'] as const
const STEP_KEYS: Record<EventStep['type'], readonly string[]> = {
  message: ['type', 'textJa'],
  learn: ['type', 'vocabulary', 'grammar'],
  conversation: ['type', 'id'],
  column: ['type', 'id'],
  dictionary: ['type', 'textJa'],
  dayEnd: ['type', 'textJa'],
  background: ['type', 'id'],
  story: ['type', 'id'],
  reading: ['type', 'id'],
  order: ['type', 'id'],
  listening: ['type'],
  chapterEnd: ['type', 'textJa'],
  hangulIntro: ['type'],
}

/** イベントの段階で使う教材のうち、1つのイベントでしか使えないもの（会話・おはなし・読み物・注文） */
const SINGLE_USE_STEPS = ['conversation', 'story', 'reading', 'order'] as const
type SingleUseStep = Extract<EventStep, { type: (typeof SINGLE_USE_STEPS)[number] }>

function isSingleUseStep(step: EventStep): step is SingleUseStep {
  return (SINGLE_USE_STEPS as readonly string[]).includes(step.type)
}

function parseStep(value: Obj, path: string, eventLocation: string | undefined, ctx: ReferenceContext, errs: FieldError[]): EventStep | undefined {
  const type = oneOf(value, 'type', path, errs, EVENT_STEP_TYPES)
  if (type === undefined) return undefined
  checkKnownKeys(value, STEP_KEYS[type], path, errs)
  switch (type) {
    case 'message':
    case 'dictionary':
    case 'dayEnd':
    case 'chapterEnd': {
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
      const id = backgroundId(value, 'id', path, ctx, errs)
      return id === undefined ? undefined : { type, id }
    }
    case 'story':
    case 'reading': {
      const id = text(value, 'id', path, errs)
      if (id === undefined) return undefined
      const known = type === 'story' ? ctx.storyIds : ctx.readingIds
      if (!known.has(id)) {
        errs.push({ path: joinPath(path, 'id'), message: `存在しない${type === 'story' ? 'おはなし' : '読み物'}のIDです：${id}` })
        return undefined
      }
      return { type, id }
    }
    case 'order': {
      const id = text(value, 'id', path, errs)
      if (id === undefined) return undefined
      const orderLocation = ctx.orderLocations.get(id)
      if (orderLocation === undefined) {
        errs.push({ path: joinPath(path, 'id'), message: `存在しない注文IDです：${id}` })
        return undefined
      }
      if (eventLocation !== undefined && orderLocation !== eventLocation) {
        errs.push({ path: joinPath(path, 'id'), message: `注文 ${id} の施設（${orderLocation}）が、イベントの施設（${eventLocation}）と違います` })
        return undefined
      }
      return { type, id }
    }
    case 'listening':
    case 'hangulIntro':
      return { type }
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
  if (o['start'] !== undefined && o['start'] !== 'auto') errs.push({ path: 'start', message: 'start に書けるのは "auto"（ボタンを押さなくても始まる）だけです。ふだんは書きません' })
  const unlocks = idList(o, 'unlocks', '', errs, ctx.locationIds, '施設ID', true)
  if (unlocks !== undefined && unlocks.length === 0) errs.push({ path: 'unlocks', message: '施設IDを1つ以上入れてください（開く施設がなければ unlocks を書きません）' })

  const steps: EventStep[] = []
  for (const { value, path } of objArray(o, 'steps', '', errs, 1) ?? []) {
    const step = parseStep(value, path, location, ctx, errs)
    if (step !== undefined) steps.push(step)
  }
  if (steps.at(-1)?.type === 'background') {
    errs.push({ path: 'steps', message: '最後の段階に background は置けません（イベントが終わると、施設のふだんの背景に戻ります）' })
  }
  const singleUse = steps.filter(isSingleUseStep).map((s) => s.id)
  if (new Set(singleUse).size !== singleUse.length) {
    errs.push({ path: 'steps', message: '同じ会話・おはなし・読み物・注文を、1つのイベントの中で2回使っています' })
  }
  for (const type of ['listening', 'hangulIntro', 'chapterEnd'] as const) {
    if (steps.filter((s) => s.type === type).length > 1) errs.push({ path: 'steps', message: `${type} の段階は、1つのイベントに1つまでです` })
  }

  if (errs.length > 0 || id === undefined || chapter === undefined || location === undefined || requires === undefined || objectiveJa === undefined || actionJa === undefined) {
    return undefined
  }
  if (requires.includes(id)) {
    errs.push({ path: 'requires', message: '自分自身を前提にはできません' })
    return undefined
  }
  const event: GameEvent = { id, chapter, location, requires, objectiveJa, actionJa, steps }
  if (o['start'] === 'auto') event.start = 'auto'
  if (unlocks !== undefined) event.unlocks = unlocks
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

const LETTER_KEYS = ['jamo', 'sounds', 'tipJa', 'confusableWith', 'figures'] as const

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
    const figures = parseFigures(value, path, errs)
    if (jamo === undefined || tipJa === undefined) continue
    const letter: HangulLetter = { jamo, sounds, tipJa }
    if (confusableWith !== undefined) letter.confusableWith = confusableWith
    if (figures !== undefined) letter.figures = figures
    letters.push(letter)
  }
  if (new Set(letters.map((l) => l.jamo)).size !== letters.length) {
    errs.push({ path: 'letters', message: '同じ字母が重複しています' })
  }
  return letters
}

const FINAL_KEYS = ['sound', 'letters', 'sounds', 'tipJa', 'figures'] as const

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
    const figures = parseFigures(value, path, errs)
    if (sound === undefined || letters === undefined || tipJa === undefined) continue
    const final: HangulFinal = { sound, letters, sounds, tipJa }
    if (figures !== undefined) final.figures = figures
    finals.push(final)
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

const RULE_KEYS = ['titleJa', 'explanationJa', 'examples', 'figures'] as const
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
    const figures = parseFigures(value, path, errs)
    if (titleJa === undefined || explanationJa === undefined) continue
    const rule: SoundChangeRule = { titleJa, explanationJa, examples }
    if (figures !== undefined) rule.figures = figures
    rules.push(rule)
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

const HANGUL_LESSON_KEYS = ['id', 'order', 'kind', 'titleJa', 'introJa', 'figures', 'letters', 'finals', 'rules', 'words', 'vocabulary', 'reviewed', 'notes'] as const

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
  const figures = parseFigures(o, '', errs)
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
  if (figures !== undefined) lesson.figures = figures
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

const DRILL_KEYS = ['id', 'titleJa', 'introJa', 'figures', 'questionCount', 'items', 'reviewed', 'notes'] as const

function parseDrill(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): Drill | undefined {
  checkKnownKeys(o, DRILL_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.drill, 'drill_001', errs)
  const titleJa = japaneseText(o, 'titleJa', '', errs)
  const introJa = optionalText(o, 'introJa', '', errs)
  const questionCount = o['questionCount'] === undefined ? undefined : integer(o, 'questionCount', '', errs, 1, 50)
  const items = parseDrillItems(o, errs, MIN_DRILL_ITEMS, false)
  const figures = parseFigures(o, '', errs)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  if (errs.length > 0 || id === undefined || titleJa === undefined || reviewed === undefined) return undefined
  const drill: Drill = { id, titleJa, items, reviewed }
  if (introJa !== undefined) drill.introJa = introJa
  if (figures !== undefined) drill.figures = figures
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

// ---------- 聞き分けの組（GAME_SPEC 4-10） ----------

const EAR_SET_KEYS = ['id', 'theme', 'titleJa', 'focusJa', 'tipJa', 'stumbling', 'items', 'figures', 'reviewed', 'notes'] as const
const EAR_ITEM_KEYS = ['korean', 'pronunciation', 'japanese'] as const

function parseEarSet(o: Obj, _ctx: ReferenceContext, errs: FieldError[]): EarSet | undefined {
  checkKnownKeys(o, EAR_SET_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.earSet, 'ear_001', errs)
  const rawTheme = o['theme']
  const theme = EAR_THEMES.find((t) => t === rawTheme)
  if (theme === undefined) errs.push({ path: 'theme', message: `知らないテーマです。使えるもの：${EAR_THEMES.join(', ')}` })
  // 組の名前・説明には、字母（ㅂ・ㅍ など）や単語を入れてよい
  const titleJa = text(o, 'titleJa', '', errs)
  const focusJa = text(o, 'focusJa', '', errs)
  const tipJa = text(o, 'tipJa', '', errs)
  const stumbling = textArray(o, 'stumbling', '', errs, { optional: true, min: 1 }) ?? []
  for (const [i, s] of stumbling.entries()) {
    if (!ID_PATTERNS.stumbling.test(s)) errs.push({ path: `stumbling[${i}]`, message: 'つまずきリストのID（例：S01）を書いてください' })
  }
  const items: EarItem[] = []
  for (const { value, path } of objArray(o, 'items', '', errs, EAR_ITEMS_MIN) ?? []) {
    checkKnownKeys(value, EAR_ITEM_KEYS, path, errs)
    const korean = koreanText(value, 'korean', path, errs)
    if (korean !== undefined && !HANGUL.test(korean)) errs.push({ path: joinPath(path, 'korean'), message: '韓国語（ハングル）で書いてください' })
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    const japanese = japaneseText(value, 'japanese', path, errs)
    if (korean !== undefined && pronunciation !== undefined && japanese !== undefined) items.push({ korean, pronunciation, japanese })
  }
  if (Array.isArray(o['items']) && o['items'].length > EAR_ITEMS_MAX) {
    errs.push({ path: 'items', message: `1つの組の音は ${EAR_ITEMS_MIN}〜${EAR_ITEMS_MAX} 個にしてください` })
  }
  // 同じ音は聞き分けられないので、組の中で同じ韓国語（空白・句読点の違いだけのものを含む）は使えない
  const keys = items.map((i) => normalizeAnswer(i.korean).replace(/ /g, ''))
  if (new Set(keys).size !== keys.length) errs.push({ path: 'items', message: '同じ韓国語が重複しています' })
  if (new Set(items.map((i) => i.japanese)).size !== items.length) {
    errs.push({ path: 'items', message: '同じ意味（japanese）が重複しています。選択肢で区別できるよう、意味を書き分けてください' })
  }
  const figures = parseFigures(o, '', errs)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  if (errs.length > 0 || id === undefined || theme === undefined || titleJa === undefined || focusJa === undefined || tipJa === undefined || reviewed === undefined) return undefined
  const set: EarSet = { id, theme, titleJa, focusJa, tipJa, stumbling, items, reviewed }
  if (figures !== undefined) set.figures = figures
  if (notes !== undefined) set.notes = notes
  return set
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

// ---------- おはなし（GAME_SPEC 3-2） ----------

const STORY_KEYS = ['id', 'chapter', 'titleJa', 'bgm', 'beats', 'reviewed', 'notes'] as const
const STORY_BEAT_KEYS: Record<StoryBeat['type'], readonly string[]> = {
  scene: ['type', 'background', 'image', 'character', 'call'],
  narration: ['type', 'textJa'],
  line: ['type', ...LINE_KEYS],
  sign: ['type', 'korean', 'pronunciation', 'japanese', 'glosses'],
  choice: ['type', 'promptJa', 'choices'],
  sfx: ['type', 'id'],
  bgm: ['type', 'id'],
}
const STORY_CHOICE_KEYS = ['korean', 'pronunciation', 'japanese', 'reply'] as const
/** 画面に出す段階（これが1つもないおはなしは作れない） */
const VISIBLE_BEATS: readonly StoryBeat['type'][] = ['narration', 'line', 'sign', 'choice']

/** 背景のID（場面の背景か施設ID） */
function backgroundId(o: Obj, key: string, base: string, ctx: ReferenceContext, errs: FieldError[]): string | undefined {
  const id = text(o, key, base, errs)
  if (id === undefined) return undefined
  if (!(SCENE_BACKGROUNDS as readonly string[]).includes(id) && !ctx.locationIds.has(id)) {
    errs.push({ path: joinPath(base, key), message: `存在しない背景IDです：${id}（場面の背景 ${SCENE_BACKGROUNDS.join('・')} か、施設ID）` })
    return undefined
  }
  return id
}

function parseStoryBeat(value: Obj, path: string, ctx: ReferenceContext, errs: FieldError[]): StoryBeat | undefined {
  const type = oneOf(value, 'type', path, errs, STORY_BEAT_TYPES)
  if (type === undefined) return undefined
  if (type !== 'line') checkKnownKeys(value, STORY_BEAT_KEYS[type], path, errs)
  switch (type) {
    case 'scene': {
      const keys = ['background', 'image', 'character', 'call'] as const
      if (!keys.some((k) => k in value)) {
        errs.push({ path, message: `scene には ${keys.join('・')} のどれかを書いてください` })
        return undefined
      }
      const beat: Extract<StoryBeat, { type: 'scene' }> = { type }
      if (value['background'] !== undefined) {
        const background = backgroundId(value, 'background', path, ctx, errs)
        if (background !== undefined) beat.background = background
      }
      const image = nullable(value, 'image', () => keyField(value, 'image', path, errs))
      const character = nullable(value, 'character', () => reference(value, 'character', path, errs, ctx.characterIds, 'キャラクターID'))
      const call = nullable(value, 'call', () => reference(value, 'call', path, errs, ctx.characterIds, 'キャラクターID'))
      if (image !== undefined) beat.image = image
      if (character !== undefined) beat.character = character
      if (call !== undefined) beat.call = call
      return beat
    }
    case 'narration': {
      const textJa = japaneseText(value, 'textJa', path, errs)
      return textJa === undefined ? undefined : { type, textJa }
    }
    case 'line': {
      const line = parseLine(value, path, ctx, errs, STORY_BEAT_KEYS.line)
      return line === undefined ? undefined : { type, ...line }
    }
    case 'sign': {
      const korean = text(value, 'korean', path, errs)
      const pronunciation = reading(value, 'pronunciation', path, errs, korean)
      const japanese = text(value, 'japanese', path, errs)
      const glosses = parseGlosses(value, path, korean, ctx, errs)
      if (korean === undefined || pronunciation === undefined || japanese === undefined) return undefined
      const beat: StoryBeat = { type, korean, pronunciation, japanese }
      if (glosses !== undefined) beat.glosses = glosses
      return beat
    }
    case 'choice': {
      const promptJa = value['promptJa'] === undefined ? undefined : japaneseText(value, 'promptJa', path, errs)
      const choices: StoryChoice[] = []
      for (const { value: c, path: cPath } of objArray(value, 'choices', path, errs, 2) ?? []) {
        checkKnownKeys(c, STORY_CHOICE_KEYS, cPath, errs)
        const korean = text(c, 'korean', cPath, errs)
        const pronunciation = reading(c, 'pronunciation', cPath, errs, korean)
        const japanese = text(c, 'japanese', cPath, errs)
        const reply = parseLines(c, 'reply', cPath, ctx, errs, 1)
        if (korean !== undefined && pronunciation !== undefined && japanese !== undefined && reply !== undefined) choices.push({ korean, pronunciation, japanese, reply })
      }
      if (new Set(choices.map((c) => c.korean)).size !== choices.length) errs.push({ path: joinPath(path, 'choices'), message: '同じ韓国語の選択肢が重複しています' })
      const beat: StoryBeat = { type, choices }
      if (promptJa !== undefined) beat.promptJa = promptJa
      return beat
    }
    case 'sfx': {
      const id = oneOf(value, 'id', path, errs, SCENE_SOUNDS)
      return id === undefined ? undefined : { type, id }
    }
    case 'bgm': {
      const id = oneOf(value, 'id', path, errs, [...BGM_IDS, 'none'] as const)
      return id === undefined ? undefined : { type, id }
    }
  }
}

function parseStory(o: Obj, ctx: ReferenceContext, errs: FieldError[]): Story | undefined {
  checkKnownKeys(o, STORY_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.story, 'story_001', errs)
  const chapter = integer(o, 'chapter', '', errs, 1, MAX_CHAPTER)
  const titleJa = japaneseText(o, 'titleJa', '', errs)
  const bgm = o['bgm'] === undefined ? undefined : oneOf(o, 'bgm', '', errs, BGM_IDS)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  const beats: StoryBeat[] = []
  for (const { value, path } of objArray(o, 'beats', '', errs, 1) ?? []) {
    const beat = parseStoryBeat(value, path, ctx, errs)
    if (beat !== undefined) beats.push(beat)
  }
  if (Array.isArray(o['beats']) && !beats.some((b) => VISIBLE_BEATS.includes(b.type))) {
    errs.push({ path: 'beats', message: `画面に出す段階（${VISIBLE_BEATS.join('・')}）を1つ以上入れてください` })
  }
  if (errs.length > 0 || id === undefined || chapter === undefined || titleJa === undefined || reviewed === undefined) return undefined
  const story: Story = { id, chapter, titleJa, beats, reviewed }
  if (bgm !== undefined) story.bgm = bgm
  if (notes !== undefined) story.notes = notes
  return story
}

// ---------- メニュー（GAME_SPEC 4-4） ----------

const MENU_KEYS = ['id', 'location', 'titleJa', 'currency', 'items', 'reviewed', 'notes'] as const
const MENU_CURRENCY_KEYS = ['korean', 'pronunciation'] as const
const MENU_ITEM_KEYS = ['key', 'display', 'vocab', 'price', 'pricePronunciation', 'image', 'counter', 'reply'] as const
export const MENU_ITEMS_MAX = 12

function parseMenu(o: Obj, ctx: ReferenceContext, errs: FieldError[]): Menu | undefined {
  checkKnownKeys(o, MENU_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.menu, 'menu_001', errs)
  const location = reference(o, 'location', '', errs, ctx.locationIds, '施設ID')
  const titleJa = japaneseText(o, 'titleJa', '', errs)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  let currency: Menu['currency'] | undefined
  const rawCurrency = o['currency']
  if (!isObj(rawCurrency)) {
    errs.push({ path: 'currency', message: rawCurrency === undefined ? '必須項目がありません' : 'オブジェクト（{ }）にしてください' })
  } else {
    checkKnownKeys(rawCurrency, MENU_CURRENCY_KEYS, 'currency', errs)
    const korean = koreanText(rawCurrency, 'korean', 'currency', errs)
    const pronunciation = reading(rawCurrency, 'pronunciation', 'currency', errs, korean)
    if (korean !== undefined && pronunciation !== undefined) currency = { korean, pronunciation }
  }
  const items: MenuItem[] = []
  for (const { value, path } of objArray(o, 'items', '', errs, 1) ?? []) {
    checkKnownKeys(value, MENU_ITEM_KEYS, path, errs)
    const key = keyField(value, 'key', path, errs)
    // 文字のメニュー（board）は絵を出さない。ショーケース（showcase）は絵と札で見せる
    const display = oneOf(value, 'display', path, errs, MENU_DISPLAYS)
    if (display === 'board' && value['image'] !== undefined) errs.push({ path: joinPath(path, 'image'), message: '文字のメニュー（"display": "board"）の品物には、絵（image）を書きません' })
    if (display === 'showcase' && value['image'] === undefined) errs.push({ path: joinPath(path, 'image'), message: 'ショーケース（"display": "showcase"）の品物には、絵（image）が必須です' })
    const vocab = reference(value, 'vocab', path, errs, ctx.vocabularyIds, '単語ID')
    const price = integer(value, 'price', path, errs, 0)
    // 値段の読みは「4,500원」のように1つのまとまりなので、区切りのない読みにする
    const pricePronunciation = reading(value, 'pricePronunciation', path, errs, '0')
    const image = value['image'] === undefined ? undefined : oneOf(value, 'image', path, errs, MENU_IMAGES)
    const counter = koreanText(value, 'counter', path, errs)
    if (counter !== undefined && !HANGUL.test(counter)) errs.push({ path: joinPath(path, 'counter'), message: '数え方の単位は韓国語（例：잔、개）で書いてください' })
    const reply = parseLines(value, 'reply', path, ctx, errs, 1)
    if (key === undefined || display === undefined || vocab === undefined || price === undefined || pricePronunciation === undefined || counter === undefined || reply === undefined) continue
    const item: MenuItem = { key, display, vocab, price, pricePronunciation, counter, reply }
    if (image !== undefined) item.image = image
    items.push(item)
  }
  if (Array.isArray(o['items']) && o['items'].length > MENU_ITEMS_MAX) errs.push({ path: 'items', message: `品物は ${MENU_ITEMS_MAX} 個までにしてください` })
  if (new Set(items.map((i) => i.key)).size !== items.length) errs.push({ path: 'items', message: '同じ key の品物が重複しています' })
  if (new Set(items.map((i) => i.vocab)).size !== items.length) errs.push({ path: 'items', message: '同じ単語（vocab）の品物が重複しています' })
  const images = items.flatMap((i) => (i.image === undefined ? [] : [i.image]))
  if (new Set(images).size !== images.length) errs.push({ path: 'items', message: '同じ絵（image）を2つの品物に使っています' })
  if (errs.length > 0 || id === undefined || location === undefined || titleJa === undefined || currency === undefined || reviewed === undefined) return undefined
  const menu: Menu = { id, location, titleJa, currency, items, reviewed }
  if (notes !== undefined) menu.notes = notes
  return menu
}

// ---------- 注文（GAME_SPEC 4-4） ----------

const ORDER_KEYS = ['id', 'chapter', 'location', 'character', 'menu', 'task', 'lines', 'counts', 'endings', 'modifiers', 'closing', 'notOnMenu', 'unclear', 'counterNoteJa', 'reviewed', 'notes'] as const
const ORDER_COUNT_KEYS = ['korean', 'pronunciation', 'number', 'counter', 'confirm'] as const
const ORDER_ENDING_KEYS = ['korean', 'pronunciation', 'attached'] as const
const ORDER_MODIFIER_KEYS = ['korean', 'pronunciation', 'counter'] as const

/** 数え方の単位（counter）。メニューの品物のどれかの単位であること */
function counterOf(value: Obj, path: string, counters: ReadonlySet<string> | undefined, errs: FieldError[]): string | undefined {
  if (value['counter'] === undefined) return undefined
  const counter = koreanText(value, 'counter', path, errs)
  if (counter !== undefined && counters !== undefined && !counters.has(counter)) {
    errs.push({ path: joinPath(path, 'counter'), message: `メニューの品物に、数え方が「${counter}」のものがありません（使われている単位：${[...counters].join('・')}）` })
    return undefined
  }
  return counter
}

function parseOrder(o: Obj, ctx: ReferenceContext, errs: FieldError[]): Order | undefined {
  checkKnownKeys(o, ORDER_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.order, 'order_001', errs)
  const chapter = integer(o, 'chapter', '', errs, 1, MAX_CHAPTER)
  const location = reference(o, 'location', '', errs, ctx.locationIds, '施設ID')
  const character = reference(o, 'character', '', errs, ctx.characterIds, 'キャラクターID')
  const menuId = reference(o, 'menu', '', errs, new Set(ctx.menus.keys()), 'メニューID')
  const menu = menuId === undefined ? undefined : ctx.menus.get(menuId)
  if (menu !== undefined && location !== undefined && menu.location !== location) {
    errs.push({ path: 'menu', message: `メニュー ${menu.id} の施設（${menu.location}）が、注文の施設（${location}）と違います` })
  }
  const counters = menu === undefined ? undefined : new Set(menu.items.map((i) => i.counter))
  const task = japaneseText(o, 'task', '', errs)
  const lines = parseLines(o, 'lines', '', ctx, errs, 1)

  const counts: OrderCount[] = []
  for (const { value, path } of objArray(o, 'counts', '', errs, 1) ?? []) {
    checkKnownKeys(value, ORDER_COUNT_KEYS, path, errs)
    const korean = koreanText(value, 'korean', path, errs)
    const pronunciation = reading(value, 'pronunciation', path, errs, korean)
    const number = integer(value, 'number', path, errs, 1, 99)
    const counter = counterOf(value, path, counters, errs)
    const confirm = parseLines(value, 'confirm', path, ctx, errs, 1)
    if (korean === undefined || pronunciation === undefined || number === undefined || confirm === undefined) continue
    const count: OrderCount = { korean, pronunciation, number, confirm }
    if (counter !== undefined) count.counter = counter
    counts.push(count)
  }
  if (new Set(counts.map((c) => normalizeAnswer(c.korean))).size !== counts.length) errs.push({ path: 'counts', message: '同じ韓国語の数が重複しています' })

  const endings: OrderEnding[] = []
  for (const { value, path } of objArray(o, 'endings', '', errs, 1) ?? []) {
    checkKnownKeys(value, ORDER_ENDING_KEYS, path, errs)
    const korean = koreanText(value, 'korean', path, errs)
    const attached = value['attached'] === undefined ? false : bool(value, 'attached', path, errs)
    let pronunciation: string | undefined
    if (attached === true) {
      if (value['pronunciation'] !== undefined) errs.push({ path: joinPath(path, 'pronunciation'), message: 'くっつける言い方（attached: true）は答えの例に使わないので、読みは書かないでください' })
    } else {
      pronunciation = reading(value, 'pronunciation', path, errs, korean)
    }
    if (korean === undefined || attached === undefined) continue
    const ending: OrderEnding = { korean }
    if (pronunciation !== undefined) ending.pronunciation = pronunciation
    if (attached) ending.attached = true
    endings.push(ending)
  }
  if (Array.isArray(o['endings']) && endings.length > 0 && endings.every((e) => e.attached === true)) {
    errs.push({ path: 'endings', message: '答えの例に使うため、くっつけない言い方（例：주세요）を1つ以上入れてください' })
  }
  if (new Set(endings.map((e) => e.korean)).size !== endings.length) errs.push({ path: 'endings', message: '同じ言い方が重複しています' })

  let modifiers: OrderModifier[] | undefined
  if (o['modifiers'] !== undefined) {
    modifiers = []
    for (const { value, path } of objArray(o, 'modifiers', '', errs, 1) ?? []) {
      checkKnownKeys(value, ORDER_MODIFIER_KEYS, path, errs)
      const korean = koreanText(value, 'korean', path, errs)
      const pronunciation = reading(value, 'pronunciation', path, errs, korean)
      const counter = counterOf(value, path, counters, errs)
      if (korean === undefined || pronunciation === undefined) continue
      const modifier: OrderModifier = { korean, pronunciation }
      if (counter !== undefined) modifier.counter = counter
      modifiers.push(modifier)
    }
  }
  const closing = parseLines(o, 'closing', '', ctx, errs, 1)
  const notOnMenu = parseLines(o, 'notOnMenu', '', ctx, errs, 1)
  const unclear = parseLines(o, 'unclear', '', ctx, errs, 1)
  const counterNoteJa = optionalText(o, 'counterNoteJa', '', errs)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)
  if (
    errs.length > 0 ||
    id === undefined ||
    chapter === undefined ||
    location === undefined ||
    character === undefined ||
    menuId === undefined ||
    task === undefined ||
    lines === undefined ||
    closing === undefined ||
    notOnMenu === undefined ||
    unclear === undefined ||
    reviewed === undefined
  ) {
    return undefined
  }
  const order: Order = { id, chapter, location, character, menu: menuId, task, lines, counts, endings, closing, notOnMenu, unclear, reviewed }
  if (modifiers !== undefined) order.modifiers = modifiers
  if (counterNoteJa !== undefined) order.counterNoteJa = counterNoteJa
  if (notes !== undefined) order.notes = notes
  return order
}

// ---------- 読み物（GAME_SPEC 4-7） ----------

const READING_KEYS = ['id', 'chapter', 'titleJa', 'style', 'lines', 'menu', 'questions', 'reviewed', 'notes'] as const
const READING_LINE_KEYS = ['korean', 'pronunciation', 'japanese', 'glosses'] as const
const READING_QUESTION_KEYS: Record<ReadingQuestion['type'], readonly string[]> = {
  choice: ['type', 'questionJa', 'questionKorean', 'choices', 'explanationJa'],
  number: ['type', 'questionJa', 'questionKorean', 'digits', 'explanationJa'],
  write: ['type', 'questionJa', 'questionKorean', 'answers', 'explanationJa'],
  find: ['type', 'questionJa', 'questionKorean', 'answer', 'findIn', 'explanationJa'],
}

/** 本文の1文（lines の各要素・問題文の韓国語 questionKorean） */
function parseReadingLine(value: Obj, path: string, ctx: ReferenceContext, errs: FieldError[]): ReadingLine | undefined {
  checkKnownKeys(value, READING_LINE_KEYS, path, errs)
  const korean = text(value, 'korean', path, errs)
  const pronunciation = reading(value, 'pronunciation', path, errs, korean)
  const japanese = text(value, 'japanese', path, errs)
  const glosses = parseGlosses(value, path, korean, ctx, errs)
  if (korean === undefined || pronunciation === undefined || japanese === undefined) return undefined
  const line: ReadingLine = { korean, pronunciation, japanese }
  if (glosses !== undefined) line.glosses = glosses
  return line
}

/** 「探して押す」問題の答えを探す文。読み物にない場所は null */
interface FindPassages {
  /** メニューの品名 */
  menu: readonly string[] | null
  /** 本文の韓国語 */
  lines: readonly string[] | null
}
const READING_CHOICE_KEYS = ['textJa', 'korean', 'pronunciation', 'japanese', 'correct'] as const

function parseReadingQuestion(value: Obj, path: string, passages: FindPassages, ctx: ReferenceContext, errs: FieldError[]): ReadingQuestion | undefined {
  const type = oneOf(value, 'type', path, errs, READING_QUESTION_TYPES)
  if (type === undefined) return undefined
  checkKnownKeys(value, READING_QUESTION_KEYS[type], path, errs)
  // 問題文と解説は、本文の語句を示すためにハングルを入れてよい
  const questionJa = text(value, 'questionJa', path, errs)
  const explanationJa = optionalText(value, 'explanationJa', path, errs)
  let questionKorean: ReadingLine | undefined
  const rawQuestionKorean = value['questionKorean']
  if (rawQuestionKorean !== undefined) {
    const qkPath = joinPath(path, 'questionKorean')
    if (isObj(rawQuestionKorean)) questionKorean = parseReadingLine(rawQuestionKorean, qkPath, ctx, errs)
    else errs.push({ path: qkPath, message: 'オブジェクト（{ }）にしてください' })
  }
  let question: ReadingQuestion | undefined
  switch (type) {
    case 'choice': {
      const choices: ReadingChoice[] = []
      const items = objArray(value, 'choices', path, errs, 2) ?? []
      for (const { value: c, path: cPath } of items) {
        checkKnownKeys(c, READING_CHOICE_KEYS, cPath, errs)
        const correct = bool(c, 'correct', cPath, errs)
        const isKorean = c['korean'] !== undefined
        if (isKorean === (c['textJa'] !== undefined)) {
          errs.push({ path: cPath, message: '選択肢は、textJa（日本語）か korean・pronunciation・japanese（韓国語）のどちらか一方で書いてください' })
          continue
        }
        if (correct === undefined) continue
        if (isKorean) {
          const korean = text(c, 'korean', cPath, errs)
          const pronunciation = reading(c, 'pronunciation', cPath, errs, korean)
          const japanese = text(c, 'japanese', cPath, errs)
          if (korean !== undefined && pronunciation !== undefined && japanese !== undefined) choices.push({ korean, pronunciation, japanese, correct })
        } else {
          const textJa = japaneseText(c, 'textJa', cPath, errs)
          if (textJa !== undefined) choices.push({ textJa, correct })
        }
      }
      const correctCount = items.filter(({ value: c }) => c['correct'] === true).length
      if (items.length > 0 && correctCount !== 1) errs.push({ path: joinPath(path, 'choices'), message: `"correct": true の選択肢をちょうど1つにしてください（今は${correctCount}つ）` })
      const labels = choices.map((c) => ('korean' in c ? c.korean : c.textJa))
      if (new Set(labels).size !== labels.length) errs.push({ path: joinPath(path, 'choices'), message: '同じ選択肢が重複しています' })
      if (questionJa !== undefined) question = { type, questionJa, choices }
      break
    }
    case 'number': {
      const digits = text(value, 'digits', path, errs)
      if (digits !== undefined && !DIGITS_PATTERN.test(digits)) {
        errs.push({ path: joinPath(path, 'digits'), message: '半角数字で書いてください。時刻・日付は : と / で区切ります（例：4500、3:30）。カンマ・単位は入れません' })
      } else if (digits !== undefined && questionJa !== undefined) {
        question = { type, questionJa, digits }
      }
      break
    }
    case 'write': {
      const answers = textArray(value, 'answers', path, errs, { optional: false, min: 1 })
      for (const [i, a] of (answers ?? []).entries()) {
        if (!HANGUL.test(a)) errs.push({ path: `${joinPath(path, 'answers')}[${i}]`, message: '答えは韓国語（ハングル）で書いてください' })
      }
      if (answers !== undefined && questionJa !== undefined) question = { type, questionJa, answers }
      break
    }
    case 'find': {
      const answer = text(value, 'answer', path, errs)
      // 答えがある場所：書いてあればそこ。書いていなければ、読み物にある場所が1つだけのときはそこ（両方あるときは必須）
      let findIn: FindPlace | undefined
      if (value['findIn'] !== undefined) {
        findIn = oneOf(value, 'findIn', path, errs, FIND_PLACES)
        if (findIn !== undefined && passages[findIn] === null) {
          errs.push({ path: joinPath(path, 'findIn'), message: findIn === 'menu' ? 'この読み物にはメニューがありません' : 'この読み物には本文（lines）がありません' })
          findIn = undefined
        }
      } else if (passages.menu !== null && passages.lines !== null) {
        errs.push({ path: joinPath(path, 'findIn'), message: 'メニューと本文の両方がある読み物では、答えがある場所（"menu" か "lines"）を書いてください' })
      } else {
        findIn = passages.menu !== null ? 'menu' : 'lines'
      }
      if (answer === undefined || findIn === undefined) break
      const passage = passages[findIn] ?? []
      if (!passage.some((p) => findChunkSequence(p, answer) >= 0)) {
        const where = findIn === 'menu' ? 'メニューの品名' : '本文'
        errs.push({ path: joinPath(path, 'answer'), message: `「${answer}」が${where}の中に、空白で区切ったまとまりのままありません` })
      } else if (questionJa !== undefined) {
        question = { type, questionJa, answer, findIn }
      }
      break
    }
  }
  if (question !== undefined && questionKorean !== undefined) question.questionKorean = questionKorean
  if (question !== undefined && explanationJa !== undefined) question.explanationJa = explanationJa
  return question
}

function parseReading(o: Obj, ctx: ReferenceContext, errs: FieldError[]): Reading | undefined {
  checkKnownKeys(o, READING_KEYS, '', errs)
  const id = idField(o, ID_PATTERNS.reading, 'reading_001', errs)
  const chapter = integer(o, 'chapter', '', errs, 1, MAX_CHAPTER)
  const titleJa = japaneseText(o, 'titleJa', '', errs)
  const style = oneOf(o, 'style', '', errs, READING_STYLES)
  const reviewed = bool(o, 'reviewed', '', errs)
  const notes = optionalText(o, 'notes', '', errs)

  let menu: Menu | undefined
  if (style === 'menu') {
    const menuId = reference(o, 'menu', '', errs, new Set(ctx.menus.keys()), 'メニューID')
    menu = menuId === undefined ? undefined : ctx.menus.get(menuId)
  } else if (o['menu'] !== undefined) {
    errs.push({ path: 'menu', message: 'menu は、style が "menu" の読み物にだけ書けます' })
  }
  const lines: ReadingLine[] = []
  if (o['lines'] !== undefined || style !== 'menu') {
    for (const { value, path } of objArray(o, 'lines', '', errs, 1) ?? []) {
      const line = parseReadingLine(value, path, ctx, errs)
      if (line !== undefined) lines.push(line)
    }
  }
  const menuNames = (menu?.items ?? []).flatMap((i) => {
    const k = ctx.vocabKorean.get(i.vocab)
    return k === undefined ? [] : [k]
  })
  const passages: FindPassages = {
    menu: style === 'menu' ? menuNames : null,
    lines: o['lines'] !== undefined || style !== 'menu' ? lines.map((l) => l.korean) : null,
  }
  const questions: ReadingQuestion[] = []
  for (const { value, path } of objArray(o, 'questions', '', errs, 1) ?? []) {
    const q = parseReadingQuestion(value, path, passages, ctx, errs)
    if (q !== undefined) questions.push(q)
  }
  if (errs.length > 0 || id === undefined || chapter === undefined || titleJa === undefined || style === undefined || reviewed === undefined) return undefined
  const result: Reading = { id, chapter, titleJa, style, lines, questions, reviewed }
  if (menu !== undefined) result.menu = menu.id
  if (notes !== undefined) result.notes = notes
  return result
}

// ---------- 章（GAME_SPEC 5章） ----------

const CHAPTER_KEYS = ['chapter', 'titleJa', 'goalJa'] as const

/** 章の一覧（src/data/chapters/）。章の番号は重ねない。章の順に並べて返す */
function loadChapters(files: FileMap, issues: ValidationIssue[]): Chapter[] {
  const chapters: Chapter[] = []
  for (const file of Object.keys(files).sort()) {
    const raw = files[file]
    if (!Array.isArray(raw)) {
      issues.push({ file, index: null, id: null, path: '', message: 'ファイル全体を配列（[ ]）にしてください' })
      continue
    }
    raw.forEach((entry: unknown, index) => {
      if (!isObj(entry)) {
        issues.push({ file, index, id: null, path: '', message: 'オブジェクト（{ }）にしてください' })
        return
      }
      const errs: FieldError[] = []
      checkKnownKeys(entry, CHAPTER_KEYS, '', errs)
      const chapter = integer(entry, 'chapter', '', errs, 1, MAX_CHAPTER)
      const titleJa = japaneseText(entry, 'titleJa', '', errs)
      const goalJa = japaneseText(entry, 'goalJa', '', errs)
      if (chapter !== undefined && chapters.some((c) => c.chapter === chapter)) errs.push({ path: 'chapter', message: `第${chapter}章が2回あります。後から出てきた方を除外しました` })
      for (const e of errs) issues.push({ file, index, id: chapter === undefined ? null : `第${chapter}章`, path: e.path, message: e.message })
      if (errs.length === 0 && chapter !== undefined && titleJa !== undefined && goalJa !== undefined) chapters.push({ chapter, titleJa, goalJa })
    })
  }
  return chapters.sort((a, b) => a.chapter - b.chapter)
}

// ---------- 実績（GAME_SPEC 7-2・7-3。Phase 4） ----------

const FURNITURE_KEYS = ['id', 'nameJa', 'slot', 'price', 'level', 'milestone', 'image', 'size', 'vocab', 'reviewed', 'notes'] as const
const FURNITURE_ID = /^furniture_\d{3}$/
const FURNITURE_IMAGE = /^[a-z][a-z0-9_]*$/

/** null か、min 以上の整数 */
function nullableInteger(o: Obj, key: string, base: string, errs: FieldError[], min: number): number | null | undefined {
  if (o[key] === null) return null
  return integer(o, key, base, errs, min)
}

/**
 * 家具・小物（src/data/furniture/）。ID は furniture_001 の形で重ねない。ファイルの名前順・ファイル内の順。
 * 置く場所は balance の room の場所。節目専用（milestone に日数）なら price・level は null で、その日数の節目が balance にあること。
 * それ以外は price（1以上）と level（1以上）を書く。size は本当の幅（m。0より大きく5以下）。vocab は単語ID か null
 */
function loadFurniture(files: FileMap, balance: Balance, vocabularyIds: ReadonlySet<string>, issues: ValidationIssue[]): Furniture[] {
  const furniture: Furniture[] = []
  const slotIds = new Set(balance.room.slots.map((s) => s.id))
  const milestoneDays = new Set(balance.stampMilestones.map((m) => m.days))
  for (const file of Object.keys(files).sort()) {
    const raw = files[file]
    if (!Array.isArray(raw)) {
      issues.push({ file, index: null, id: null, path: '', message: 'ファイル全体を配列（[ ]）にしてください' })
      continue
    }
    raw.forEach((entry: unknown, index) => {
      if (!isObj(entry)) {
        issues.push({ file, index, id: null, path: '', message: 'オブジェクト（{ }）にしてください' })
        return
      }
      const errs: FieldError[] = []
      checkKnownKeys(entry, FURNITURE_KEYS, '', errs)
      const id = text(entry, 'id', '', errs)
      if (id !== undefined && !FURNITURE_ID.test(id)) errs.push({ path: 'id', message: 'furniture_001 の形にしてください' })
      if (id !== undefined && furniture.some((f) => f.id === id)) errs.push({ path: 'id', message: `${id} が2回あります。後から出てきた方を除外しました` })
      const nameJa = japaneseText(entry, 'nameJa', '', errs)
      const slot = reference(entry, 'slot', '', errs, slotIds, '置く場所（balance の room の slots の id）')
      const price = nullableInteger(entry, 'price', '', errs, 1)
      const level = nullableInteger(entry, 'level', '', errs, 1)
      const milestone = nullableInteger(entry, 'milestone', '', errs, 1)
      if (milestone !== undefined && milestone !== null) {
        if (!milestoneDays.has(milestone)) errs.push({ path: 'milestone', message: `${milestone}日の節目が balance の stampMilestones にありません` })
        if (price !== null || level !== null) errs.push({ path: 'milestone', message: '節目専用の家具は、price と level を null にしてください（カタログでは売りません）' })
      }
      if (milestone === null && (price === null || level === null)) errs.push({ path: price === null ? 'price' : 'level', message: 'カタログで売る家具は、price と level を書いてください（節目専用なら milestone に日数）' })
      const image = text(entry, 'image', '', errs)
      if (image !== undefined && !FURNITURE_IMAGE.test(image)) errs.push({ path: 'image', message: '英小文字・数字・_ のキーにしてください（元の画像は fur_キー）' })
      if (image !== undefined && furniture.some((f) => f.image === image)) errs.push({ path: 'image', message: `絵のキー ${image} が、ほかの家具と重なっています` })
      const size = decimal(entry, 'size', '', errs, 0, 5, true)
      let vocab: string | null | undefined = null
      if (entry['vocab'] === undefined) errs.push({ path: 'vocab', message: '必須項目がありません（韓国語の名前がまだなければ null）' })
      else if (entry['vocab'] !== null) vocab = reference(entry, 'vocab', '', errs, vocabularyIds, '単語ID')
      const reviewed = bool(entry, 'reviewed', '', errs)
      const notes = optionalText(entry, 'notes', '', errs)
      for (const e of errs) issues.push({ file, index, id: id ?? null, path: e.path, message: e.message })
      if (
        errs.length > 0 ||
        id === undefined ||
        nameJa === undefined ||
        slot === undefined ||
        price === undefined ||
        level === undefined ||
        milestone === undefined ||
        image === undefined ||
        size === undefined ||
        vocab === undefined ||
        reviewed === undefined
      ) {
        return
      }
      furniture.push({ id, nameJa, slot, price, level, milestone, image, size, vocab, reviewed, ...(notes === undefined ? {} : { notes }) })
    })
  }
  return furniture
}

const ACHIEVEMENT_KEYS = ['id', 'titleJa', 'descriptionJa', 'condition', 'coins', 'reviewed', 'notes'] as const
const ACHIEVEMENT_CONDITION_KEYS = ['type', 'target'] as const
const ACHIEVEMENT_ID = /^achievement_\d{3}$/

/** 実績の一覧（src/data/achievements/）。ID は achievement_001 の形で重ねない。ファイルの名前順・ファイル内の順 */
function loadAchievements(files: FileMap, chapters: readonly Chapter[], issues: ValidationIssue[]): Achievement[] {
  const achievements: Achievement[] = []
  const chapterNumbers = new Set(chapters.map((c) => c.chapter))
  for (const file of Object.keys(files).sort()) {
    const raw = files[file]
    if (!Array.isArray(raw)) {
      issues.push({ file, index: null, id: null, path: '', message: 'ファイル全体を配列（[ ]）にしてください' })
      continue
    }
    raw.forEach((entry: unknown, index) => {
      if (!isObj(entry)) {
        issues.push({ file, index, id: null, path: '', message: 'オブジェクト（{ }）にしてください' })
        return
      }
      const errs: FieldError[] = []
      checkKnownKeys(entry, ACHIEVEMENT_KEYS, '', errs)
      const id = text(entry, 'id', '', errs)
      if (id !== undefined && !ACHIEVEMENT_ID.test(id)) errs.push({ path: 'id', message: 'achievement_001 の形にしてください' })
      if (id !== undefined && achievements.some((a) => a.id === id)) errs.push({ path: 'id', message: `${id} が2回あります。後から出てきた方を除外しました` })
      const titleJa = japaneseText(entry, 'titleJa', '', errs)
      const descriptionJa = japaneseText(entry, 'descriptionJa', '', errs)
      const coins = integer(entry, 'coins', '', errs, 0)
      const reviewed = bool(entry, 'reviewed', '', errs)
      const notes = optionalText(entry, 'notes', '', errs)
      const rawCondition = entry['condition']
      let condition: Achievement['condition'] | undefined
      if (!isObj(rawCondition)) {
        errs.push({ path: 'condition', message: 'オブジェクト（{ "type": …, "target": … }）にしてください' })
      } else {
        checkKnownKeys(rawCondition, ACHIEVEMENT_CONDITION_KEYS, 'condition', errs)
        const type = oneOf(rawCondition, 'type', 'condition', errs, ACHIEVEMENT_CONDITIONS)
        const target = integer(rawCondition, 'target', 'condition', errs, 1)
        if (type === 'chapterCleared' && target !== undefined && !chapterNumbers.has(target)) {
          errs.push({ path: 'condition.target', message: `第${target}章が、章の一覧（src/data/chapters/）にありません` })
        }
        if (type !== undefined && target !== undefined) condition = { type, target }
      }
      for (const e of errs) issues.push({ file, index, id: id ?? null, path: e.path, message: e.message })
      if (errs.length > 0 || id === undefined || titleJa === undefined || descriptionJa === undefined || coins === undefined || reviewed === undefined || condition === undefined) return
      achievements.push({ id, titleJa, descriptionJa, condition, coins, reviewed, ...(notes === undefined ? {} : { notes }) })
    })
  }
  return achievements
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
  earSets: parseEarSet,
  stories: parseStory,
  readings: parseReading,
  menus: parseMenu,
  orders: parseOrder,
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
  earSets: EarSet
  stories: Story
  readings: Reading
  menus: Menu
  orders: Order
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
  earSets: FileMap
  stories: FileMap
  readings: FileMap
  menus: FileMap
  orders: FileMap
  /** 章の一覧（ゲームデータ） */
  chapters: FileMap
  /** 実績（ゲームデータ） */
  achievements: FileMap
  /** 家具・小物（ゲームデータ） */
  furniture: FileMap
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
  /** 聞き分けの組（ファイルの名前順・ファイル内の順） */
  earSets: EarSet[]
  stories: Story[]
  readings: Reading[]
  menus: Menu[]
  orders: Order[]
  /** 章の順 */
  chapters: Chapter[]
  /** ファイルの名前順・ファイル内の順 */
  achievements: Achievement[]
  /** ファイルの名前順・ファイル内の順 */
  furniture: Furniture[]
  balance: Balance
  issues: ValidationIssue[]
}

/** balance.json が読めなかったときに使う値（ゲームを止めないため） */
export const DEFAULT_BALANCE: Balance = {
  xp: { learnWord: 2, conversationChoice: 10, conversationWrite: 15, eventComplete: 20, hangulLesson: 20, listening: 3, review: 3, drillItem: 2, chapterTest: 30, readingQuestion: 5, order: 15 },
  furiganaAlwaysUntilChapter: 3,
  initialLocations: ['home', 'cafe'],
  startLocation: 'home',
  writeAttemptsBeforeReveal: 2,
  hangulQuizQuestions: 8,
  hangulPassPercent: 80,
  listeningQuestionsPerRound: 5,
  review: { intervalsDays: [1, 3, 7, 14, 30], masteredDays: 14, dailyLimit: 20 },
  practiceQuestions: 10,
  drillQuestions: 10,
  testQuestions: 10,
  testPassPercent: 80,
  earQuestions: 10,
  stampActivities: ['review', 'drill', 'chapterTest', 'hangulLesson', 'listening', 'event', 'ear'],
  levels: { thresholds: [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3250, 3850, 4500, 5200, 5950], stepAfter: 800 },
  coins: { eventComplete: 20, chapterClear: 50, chapterTest: 50 },
  stampMilestones: [
    { days: 3, coins: 30 },
    { days: 7, coins: 50 },
    { days: 14, coins: 80 },
    { days: 30, coins: 120 },
    { days: 50, coins: 150 },
    { days: 100, coins: 300 },
  ],
  room: {
    movedInAfter: 'event_001',
    perspective: { a: 0.5426, b: 10.8, wallFloorY: 57 },
    light: { x: 45, y: 35 },
    occluders: [
      { id: 'bed', layer: 5, points: [[0, 49], [6.5, 47.2], [39.5, 47.2], [40.6, 52], [47, 66], [47.4, 69], [47.4, 78.5], [44.1, 78.5], [44.1, 74.7], [1.9, 74.7], [1.9, 80.7], [0, 80.7]] },
      { id: 'table', layer: 5, points: [[51.4, 62.2], [55.6, 58.6], [69.2, 58.6], [72.2, 63.8], [71.9, 69.8], [70.4, 69.8], [70.1, 66.2], [56.6, 66.2], [55.6, 70.4], [54.4, 70.4], [52.2, 64.4]] },
      { id: 'fridge', layer: 5, points: [[83.9, 47.4], [89.8, 46.6], [89.8, 44.9], [97.2, 44.9], [100, 45.8], [100, 79.6], [91.6, 74], [84.3, 72.9]] },
    ],
    slots: [
      { id: 'wall_left', nameJa: '壁（左）', kind: 'wall', x: 9.8, y: 31, maxW: 8.4, maxH: 20, layer: 2 },
      { id: 'wall_right', nameJa: '壁（右）', kind: 'wall', x: 83, y: 21.5, maxW: 10, maxH: 11, layer: 2 },
      { id: 'window', nameJa: '窓のそば', kind: 'floor', x: 78.5, y: 57.6, behind: ['fridge'], layer: 3 },
      { id: 'floor_left', nameJa: '床（左手前）', kind: 'floor', x: 16, y: 97, scale: 0.8, layer: 6 },
      { id: 'floor_right', nameJa: '床（右手前）', kind: 'floor', x: 86, y: 94.5, scale: 0.8, layer: 6 },
      { id: 'rug', nameJa: 'ラグ', kind: 'rug', x: 60, y: 82, scale: 0.8, behind: ['bed', 'table'], layer: 1 },
    ],
  },
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
  'review',
  'practiceQuestions',
  'drillQuestions',
  'testQuestions',
  'testPassPercent',
  'earQuestions',
  'stampActivities',
  'levels',
  'coins',
  'stampMilestones',
  'room',
] as const
const ROOM_KEYS = ['movedInAfter', 'perspective', 'light', 'occluders', 'slots'] as const
const ROOM_SLOT_KEYS = ['id', 'nameJa', 'kind', 'x', 'y', 'maxW', 'maxH', 'scale', 'behind', 'layer'] as const
const ROOM_OCCLUDER_KEYS = ['id', 'points', 'layer'] as const
const ROOM_SLOT_ID = /^[a-z][a-z0-9_]*$/
const LEVEL_KEYS = ['thresholds', 'stepAfter'] as const
const COIN_KEYS = ['eventComplete', 'chapterClear', 'chapterTest'] as const
const MILESTONE_KEYS = ['days', 'coins'] as const
const XP_KEYS = ['learnWord', 'conversationChoice', 'conversationWrite', 'eventComplete', 'hangulLesson', 'listening', 'review', 'drillItem', 'chapterTest', 'readingQuestion', 'order'] as const
const REVIEW_KEYS = ['intervalsDays', 'masteredDays', 'dailyLimit'] as const

/** 復習の間隔など（balance.json の review） */
function parseReviewBalance(raw: unknown, errs: FieldError[]): Balance['review'] | undefined {
  if (!isObj(raw)) {
    errs.push({ path: 'review', message: 'オブジェクト（{ }）にしてください' })
    return undefined
  }
  checkKnownKeys(raw, REVIEW_KEYS, 'review', errs)
  const before = errs.length
  const rawIntervals = raw['intervalsDays']
  let intervalsDays: number[] | undefined
  if (!Array.isArray(rawIntervals) || rawIntervals.length === 0 || !rawIntervals.every((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1)) {
    errs.push({ path: 'review.intervalsDays', message: '1以上の整数（日数）を1個以上並べた配列にしてください（例：[1, 3, 7, 14, 30]）' })
  } else if (rawIntervals.some((d, i) => i > 0 && d <= (rawIntervals[i - 1] ?? 0))) {
    errs.push({ path: 'review.intervalsDays', message: '間隔は、だんだん長くなるように並べてください' })
  } else {
    intervalsDays = rawIntervals
  }
  const masteredDays = integer(raw, 'masteredDays', 'review', errs, 1)
  const dailyLimit = integer(raw, 'dailyLimit', 'review', errs, 1, 200)
  if (intervalsDays !== undefined && masteredDays !== undefined && !intervalsDays.includes(masteredDays)) {
    errs.push({ path: 'review.masteredDays', message: 'masteredDays は intervalsDays のどれかの日数にしてください' })
  }
  if (errs.length > before || intervalsDays === undefined || masteredDays === undefined || dailyLimit === undefined) return undefined
  return { intervalsDays, masteredDays, dailyLimit }
}

/** レベル（balance.json の levels）。thresholds は 0 から始まり、だんだん大きくする */
function parseLevels(raw: unknown, errs: FieldError[]): Balance['levels'] | undefined {
  if (!isObj(raw)) {
    errs.push({ path: 'levels', message: 'オブジェクト（{ }）にしてください' })
    return undefined
  }
  checkKnownKeys(raw, LEVEL_KEYS, 'levels', errs)
  const before = errs.length
  const t = raw['thresholds']
  let thresholds: number[] | undefined
  if (!Array.isArray(t) || t.length < 2 || !t.every((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0)) {
    errs.push({ path: 'levels.thresholds', message: '0以上の整数（経験値）を2個以上並べた配列にしてください（例：[0, 100, 250]）' })
  } else if (t[0] !== 0) {
    errs.push({ path: 'levels.thresholds', message: '最初（レベル1）は 0 にしてください' })
  } else if (t.some((n, i) => i > 0 && n <= (t[i - 1] ?? 0))) {
    errs.push({ path: 'levels.thresholds', message: 'だんだん大きくなるように並べてください' })
  } else {
    thresholds = t
  }
  const stepAfter = integer(raw, 'stepAfter', 'levels', errs, 1)
  if (errs.length > before || thresholds === undefined || stepAfter === undefined) return undefined
  return { thresholds, stepAfter }
}

/** コイン（balance.json の coins） */
function parseCoins(raw: unknown, errs: FieldError[]): Balance['coins'] | undefined {
  if (!isObj(raw)) {
    errs.push({ path: 'coins', message: 'オブジェクト（{ }）にしてください' })
    return undefined
  }
  checkKnownKeys(raw, COIN_KEYS, 'coins', errs)
  const eventComplete = integer(raw, 'eventComplete', 'coins', errs, 0)
  const chapterClear = integer(raw, 'chapterClear', 'coins', errs, 0)
  const chapterTest = integer(raw, 'chapterTest', 'coins', errs, 0)
  if (eventComplete === undefined || chapterClear === undefined || chapterTest === undefined) return undefined
  return { eventComplete, chapterClear, chapterTest }
}

/** スタンプの節目（balance.json の stampMilestones）。日数の少ない順に、重ねずに並べる */
function parseStampMilestones(raw: unknown, errs: FieldError[]): Balance['stampMilestones'] | undefined {
  const path = 'stampMilestones'
  if (!Array.isArray(raw)) {
    errs.push({ path, message: '配列（[ ]）にしてください（節目がなければ [ ]）' })
    return undefined
  }
  const before = errs.length
  const result: Balance['stampMilestones'] = []
  raw.forEach((m: unknown, i) => {
    const base = `${path}[${i}]`
    if (!isObj(m)) {
      errs.push({ path: base, message: 'オブジェクト（{ }）にしてください' })
      return
    }
    checkKnownKeys(m, MILESTONE_KEYS, base, errs)
    const days = integer(m, 'days', base, errs, 1)
    const coins = integer(m, 'coins', base, errs, 0)
    const last = result.at(-1)
    if (days !== undefined && last !== undefined && days <= last.days) errs.push({ path: `${base}.days`, message: '日数の少ない順に、同じ日数を重ねずに並べてください' })
    if (days !== undefined && coins !== undefined) result.push({ days, coins })
  })
  return errs.length > before ? undefined : result
}

/** 部屋（balance.json の room）。場所の ID は重ねない。位置と大きさは、絵の中に収まる割合（%） */
/** min〜max の数（小数でもよい）。exclusiveMin なら min ちょうどは不可 */
function decimal(o: Obj, key: string, base: string, errs: FieldError[], min: number, max: number, exclusiveMin = false): number | undefined {
  const path = joinPath(base, key)
  const v = o[key]
  if (v === undefined) {
    errs.push({ path, message: '必須項目がありません' })
    return undefined
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (exclusiveMin && v === min)) {
    errs.push({ path, message: `${exclusiveMin ? `${min}より大きく` : `${min}以上`}${max}以下の数にしてください（引用符で囲まない）` })
    return undefined
  }
  return v
}

/** 部屋の絵の中の点 [x, y]（%） */
function roomPoint(v: unknown, path: string, errs: FieldError[]): [number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100)) {
    errs.push({ path, message: '[x, y]（どちらも 0〜100 の数）にしてください' })
    return undefined
  }
  return [v[0] as number, v[1] as number]
}

function parseRoom(raw: unknown, ctx: ReferenceContext, errs: FieldError[]): Room | undefined {
  const path = 'room'
  if (!isObj(raw)) {
    errs.push({ path, message: 'オブジェクト（{ "movedInAfter": …, "slots": […] }）にしてください' })
    return undefined
  }
  const before = errs.length
  checkKnownKeys(raw, ROOM_KEYS, path, errs)
  // イベントが1つもない（教材の一部だけを確かめるテストなど）ときは、イベントがあるかは確かめない
  const movedInAfter = ctx.eventIds.size === 0 ? text(raw, 'movedInAfter', path, errs) : reference(raw, 'movedInAfter', path, errs, ctx.eventIds, 'イベントID')

  let perspective: Room['perspective'] | undefined
  const rawPerspective = raw['perspective']
  if (!isObj(rawPerspective)) {
    errs.push({ path: `${path}.perspective`, message: 'オブジェクト（{ "a": …, "b": …, "wallFloorY": … }）にしてください' })
  } else {
    const p = `${path}.perspective`
    checkKnownKeys(rawPerspective, ['a', 'b', 'wallFloorY'], p, errs)
    const a = decimal(rawPerspective, 'a', p, errs, 0, 10, true)
    const b = decimal(rawPerspective, 'b', p, errs, -100, 100)
    const wallFloorY = decimal(rawPerspective, 'wallFloorY', p, errs, 0, 100)
    if (a !== undefined && b !== undefined && wallFloorY !== undefined) {
      if (a * (wallFloorY + b) <= 0) errs.push({ path: p, message: '奥の壁の足元（wallFloorY）での 1m の長さ a ×（wallFloorY ＋ b）が 0 以下です' })
      else perspective = { a, b, wallFloorY }
    }
  }

  let light: Room['light'] | undefined
  const rawLight = raw['light']
  if (!isObj(rawLight)) {
    errs.push({ path: `${path}.light`, message: 'オブジェクト（{ "x": …, "y": … }）にしてください' })
  } else {
    checkKnownKeys(rawLight, ['x', 'y'], `${path}.light`, errs)
    const x = percent(rawLight, 'x', `${path}.light`, errs)
    const y = percent(rawLight, 'y', `${path}.light`, errs)
    if (x !== undefined && y !== undefined) light = { x, y }
  }

  const occluders: RoomOccluder[] = []
  const rawOccluders = raw['occluders']
  if (!Array.isArray(rawOccluders)) {
    errs.push({ path: `${path}.occluders`, message: '配列（[ ]）にしてください（手前の物がなければ []）' })
  } else {
    rawOccluders.forEach((o: unknown, i) => {
      const base = `${path}.occluders[${i}]`
      if (!isObj(o)) {
        errs.push({ path: base, message: 'オブジェクト（{ }）にしてください' })
        return
      }
      checkKnownKeys(o, ROOM_OCCLUDER_KEYS, base, errs)
      const id = text(o, 'id', base, errs)
      if (id !== undefined && !ROOM_SLOT_ID.test(id)) errs.push({ path: `${base}.id`, message: '英小文字・数字・_ のキーにしてください（例：bed）' })
      if (id !== undefined && occluders.some((x) => x.id === id)) errs.push({ path: `${base}.id`, message: `${id} が2回あります` })
      const layer = integer(o, 'layer', base, errs, 0)
      const rawPoints = o['points']
      const points: [number, number][] = []
      if (!Array.isArray(rawPoints) || rawPoints.length < 3) errs.push({ path: `${base}.points`, message: '3個以上の点（[x, y]）の配列にしてください' })
      else {
        rawPoints.forEach((pt: unknown, k) => {
          const point = roomPoint(pt, `${base}.points[${k}]`, errs)
          if (point !== undefined) points.push(point)
        })
      }
      if (id === undefined || layer === undefined || points.length < 3) return
      occluders.push({ id, points, layer })
    })
  }

  const rawSlots = raw['slots']
  const slots: RoomSlot[] = []
  if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
    errs.push({ path: `${path}.slots`, message: '1個以上の配列にしてください' })
  } else {
    rawSlots.forEach((s: unknown, i) => {
      const base = `${path}.slots[${i}]`
      if (!isObj(s)) {
        errs.push({ path: base, message: 'オブジェクト（{ }）にしてください' })
        return
      }
      checkKnownKeys(s, ROOM_SLOT_KEYS, base, errs)
      const id = text(s, 'id', base, errs)
      if (id !== undefined && !ROOM_SLOT_ID.test(id)) errs.push({ path: `${base}.id`, message: '英小文字・数字・_ のキーにしてください（例：wall_left）' })
      if (id !== undefined && slots.some((o) => o.id === id)) errs.push({ path: `${base}.id`, message: `${id} が2回あります` })
      const nameJa = japaneseText(s, 'nameJa', base, errs)
      const kind = oneOf(s, 'kind', base, errs, ['wall', 'floor', 'rug'] as const)
      const x = percent(s, 'x', base, errs)
      const y = percent(s, 'y', base, errs)
      let maxW: number | undefined
      let maxH: number | undefined
      if (kind === 'wall') {
        maxW = decimal(s, 'maxW', base, errs, 0, 100, true)
        maxH = decimal(s, 'maxH', base, errs, 0, 100, true)
      } else if (kind !== undefined) {
        for (const key of ['maxW', 'maxH']) {
          if (s[key] !== undefined) errs.push({ path: `${base}.${key}`, message: `${key} は壁（kind が wall）の場所だけに書きます` })
        }
      }
      const scale = s['scale'] === undefined ? undefined : decimal(s, 'scale', base, errs, 0, 3, true)
      let behind: string[] | undefined
      if (s['behind'] !== undefined) {
        const rawBehind = s['behind']
        if (!Array.isArray(rawBehind) || rawBehind.length === 0 || !rawBehind.every((b) => typeof b === 'string')) {
          errs.push({ path: `${base}.behind`, message: '手前の物（occluders の id）の、1個以上の配列にしてください' })
        } else {
          behind = rawBehind as string[]
        }
      }
      const layer = integer(s, 'layer', base, errs, 0)
      if (behind !== undefined && layer !== undefined) {
        for (const b of behind) {
          const o = occluders.find((x) => x.id === b)
          if (o === undefined) errs.push({ path: `${base}.behind`, message: `手前の物 ${b} が occluders にありません` })
          else if (o.layer <= layer) errs.push({ path: `${base}.behind`, message: `手前の物 ${b} の layer（${o.layer}）を、この場所の layer（${layer}）より大きくしてください` })
        }
      }
      if (id === undefined || nameJa === undefined || kind === undefined || x === undefined || y === undefined || layer === undefined) return
      if (kind === 'wall' && (maxW === undefined || maxH === undefined)) return
      slots.push({
        id,
        nameJa,
        kind,
        x,
        y,
        ...(maxW === undefined ? {} : { maxW }),
        ...(maxH === undefined ? {} : { maxH }),
        ...(scale === undefined ? {} : { scale }),
        ...(behind === undefined ? {} : { behind }),
        layer,
      })
    })
  }
  if (errs.length > before || movedInAfter === undefined || perspective === undefined || light === undefined) return undefined
  return { movedInAfter, perspective, light, occluders, slots }
}

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
  const review = parseReviewBalance(raw['review'], errs)
  const practiceQuestions = integer(raw, 'practiceQuestions', '', errs, 1, 50)
  const drillQuestions = integer(raw, 'drillQuestions', '', errs, 1, 50)
  const testQuestions = integer(raw, 'testQuestions', '', errs, 1, 50)
  const testPassPercent = integer(raw, 'testPassPercent', '', errs, 0, 100)
  const earQuestions = integer(raw, 'earQuestions', '', errs, 1, 50)
  const stampActivities = stampActivityList(raw['stampActivities'], errs)
  const levels = parseLevels(raw['levels'], errs)
  const coins = parseCoins(raw['coins'], errs)
  const stampMilestones = parseStampMilestones(raw['stampMilestones'], errs)
  const room = parseRoom(raw['room'], ctx, errs)
  if (startLocation !== undefined && initialLocations !== undefined && !initialLocations.includes(startLocation)) {
    errs.push({ path: 'startLocation', message: 'startLocation は initialLocations に含めてください' })
  }
  const { learnWord, conversationChoice, conversationWrite, eventComplete, hangulLesson, listening, drillItem, chapterTest, readingQuestion, order } = xp
  const reviewXp = xp.review
  if (
    errs.length > 0 ||
    learnWord === undefined ||
    conversationChoice === undefined ||
    conversationWrite === undefined ||
    eventComplete === undefined ||
    hangulLesson === undefined ||
    listening === undefined ||
    reviewXp === undefined ||
    drillItem === undefined ||
    chapterTest === undefined ||
    readingQuestion === undefined ||
    order === undefined ||
    furiganaAlwaysUntilChapter === undefined ||
    initialLocations === undefined ||
    startLocation === undefined ||
    writeAttemptsBeforeReveal === undefined ||
    hangulQuizQuestions === undefined ||
    hangulPassPercent === undefined ||
    listeningQuestionsPerRound === undefined ||
    review === undefined ||
    practiceQuestions === undefined ||
    drillQuestions === undefined ||
    testQuestions === undefined ||
    testPassPercent === undefined ||
    earQuestions === undefined ||
    stampActivities === undefined ||
    levels === undefined ||
    coins === undefined ||
    stampMilestones === undefined ||
    room === undefined
  ) {
    return undefined
  }
  return {
    xp: { learnWord, conversationChoice, conversationWrite, eventComplete, hangulLesson, listening, review: reviewXp, drillItem, chapterTest, readingQuestion, order },
    furiganaAlwaysUntilChapter,
    initialLocations,
    startLocation,
    writeAttemptsBeforeReveal,
    hangulQuizQuestions,
    hangulPassPercent,
    listeningQuestionsPerRound,
    review,
    practiceQuestions,
    drillQuestions,
    testQuestions,
    testPassPercent,
    earQuestions,
    stampActivities,
    levels,
    coins,
    stampMilestones,
    room,
  }
}

/** スタンプを押す学習の一覧（1個以上。重ねて書かない） */
function stampActivityList(raw: unknown, errs: FieldError[]): StampActivity[] | undefined {
  const path = 'stampActivities'
  if (!Array.isArray(raw) || raw.length === 0) {
    errs.push({ path, message: `1個以上の配列にしてください。使えるもの：${STAMP_ACTIVITIES.join(', ')}` })
    return undefined
  }
  const result: StampActivity[] = []
  for (const [i, v] of raw.entries()) {
    const activity = STAMP_ACTIVITIES.find((a) => a === v)
    if (activity === undefined) errs.push({ path: `${path}[${i}]`, message: `知らない学習です。使えるもの：${STAMP_ACTIVITIES.join(', ')}` })
    else if (result.includes(activity)) errs.push({ path: `${path}[${i}]`, message: `「${activity}」が2回あります` })
    else result.push(activity)
  }
  return result.length === raw.length ? result : undefined
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

/** 同じ会話・おはなし・読み物・注文が、複数のイベントで使われていないか（後から出てきたイベントを除外する） */
function checkSingleUseSteps(events: GameEvent[], issues: ValidationIssue[], fileOf: ReadonlyMap<string, string>): GameEvent[] {
  const usedBy = new Map<string, string>()
  return events.filter((e) => {
    const ids = e.steps.filter(isSingleUseStep).map((s) => s.id)
    const clash = ids.find((c) => usedBy.has(c))
    if (clash !== undefined) {
      issues.push({ file: fileOf.get(e.id) ?? '', index: null, id: e.id, path: 'steps', message: `${clash} は、すでにイベント ${usedBy.get(clash)} で使われています` })
      return false
    }
    for (const c of ids) usedBy.set(c, e.id)
    return true
  })
}

/**
 * イベントをまたいだ確かめ。問題のあるイベントは除外する（後から出てきた方）。
 * - 章（chapter）が章の一覧にあるか
 * - 「ハングルは読めますか？」（hangulIntro）はゲーム全体で1回だけ
 */
function checkEventChapters(events: GameEvent[], chapters: readonly Chapter[], issues: ValidationIssue[], fileOf: ReadonlyMap<string, string>): GameEvent[] {
  const known = new Set(chapters.map((c) => c.chapter))
  let introOwner: string | undefined
  return events.filter((e) => {
    if (!known.has(e.chapter)) {
      issues.push({ file: fileOf.get(e.id) ?? '', index: null, id: e.id, path: 'chapter', message: `第${e.chapter}章が、章の一覧（src/data/chapters/）にありません` })
      return false
    }
    if (e.steps.some((s) => s.type === 'hangulIntro')) {
      if (introOwner !== undefined) {
        issues.push({ file: fileOf.get(e.id) ?? '', index: null, id: e.id, path: 'steps', message: `hangulIntro の段階は、ゲーム全体で1つだけです（すでにイベント ${introOwner} にあります）` })
        return false
      }
      introOwner = e.id
    }
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
  const chapters = loadChapters(input.chapters, issues)
  const baseCtx: ReferenceContext = {
    ...emptyCtx,
    locationIds: new Set(locations.map((l) => l.id)),
    characterIds: new Set(characters.map((c) => c.id)),
  }

  // 教材のIDは種類をまたいで一意にする（学習記録が ID だけで参照するため）
  const contentIds = new Map<string, string>()
  const vocabulary = validateKind('vocabulary', input.vocabulary, baseCtx, contentIds, issues)
  const grammar = validateKind('grammar', input.grammar, baseCtx, contentIds, issues)
  // 台詞の glosses は単語を参照するので、単語の後に読む
  const wordCtx: ReferenceContext = {
    ...baseCtx,
    vocabularyIds: new Set(vocabulary.map((v) => v.id)),
    vocabKorean: new Map(vocabulary.map((v) => [v.id, v.korean])),
    grammarIds: new Set(grammar.map((g) => g.id)),
  }
  const conversations = validateKind('conversations', input.conversations, wordCtx, contentIds, issues)
  const columns = validateKind('columns', input.columns, wordCtx, contentIds, issues)
  const menus = validateKind('menus', input.menus, wordCtx, contentIds, issues)
  const menuCtx: ReferenceContext = { ...wordCtx, menus: new Map(menus.map((m) => [m.id, m])) }
  const stories = validateKind('stories', input.stories, menuCtx, contentIds, issues)
  const readings = validateKind('readings', input.readings, menuCtx, contentIds, issues)
  const orders = validateKind('orders', input.orders, menuCtx, contentIds, issues)

  const ctx: ReferenceContext = {
    ...menuCtx,
    conversationLocations: new Map(conversations.map((c) => [c.id, c.location])),
    columnIds: new Set(columns.map((c) => c.id)),
    storyIds: new Set(stories.map((s) => s.id)),
    readingIds: new Set(readings.map((r) => r.id)),
    orderLocations: new Map(orders.map((o) => [o.id, o.location])),
  }
  const eventFiles = new Map<string, string>()
  const parsedEvents = validateKind('events', input.events, ctx, eventFiles, issues)
  const resolved = resolveEventRequirements(parsedEvents, issues, eventFiles)
  const checked = checkEventChapters(checkSingleUseSteps(resolved, issues, eventFiles), chapters, issues, eventFiles)
  // 除外したイベントを前提にしているイベントも、順に除外する
  const events = checked.length === resolved.length ? checked : resolveEventRequirements(checked, issues, eventFiles)
  const parsedLessons = validateKind('hangulLessons', input.hangulLessons, ctx, contentIds, issues)
  const hangulLessons = checkHangulCurriculum(parsedLessons, vocabulary, contentIds, issues)
  const listening = validateKind('listening', input.listening, { ...ctx, eventIds: new Set(events.map((e) => e.id)) }, contentIds, issues)
  // listening の段階は、afterEvent がそのイベントのリスニングの文を出す。1つもなければ知らせる（段階は飛ばす）
  for (const e of events) {
    if (e.steps.some((s) => s.type === 'listening') && !listening.some((l) => l.afterEvent === e.id)) {
      issues.push({ file: eventFiles.get(e.id) ?? '', index: null, id: e.id, path: 'steps', message: `listening の段階がありますが、afterEvent が ${e.id} のリスニングの文がありません` })
    }
  }
  const drills = checkDrillItemIds(validateKind('drills', input.drills, ctx, contentIds, issues), contentIds, issues)
  const parsedTests = validateKind('chapterTests', input.chapterTests, ctx, contentIds, issues)
  const chapterTests = checkOneTestPerChapter(checkDrillItemIds(parsedTests, contentIds, issues), contentIds, issues).sort((a, b) => a.chapter - b.chapter)
  const earSets = validateKind('earSets', input.earSets, ctx, contentIds, issues)
  const balance = loadBalance(input.balance, { ...ctx, eventIds: new Set(events.map((e) => e.id)) }, issues)
  const achievements = loadAchievements(input.achievements, chapters, issues)
  const furniture = loadFurniture(input.furniture, balance, ctx.vocabularyIds, issues)

  return {
    vocabulary,
    grammar,
    conversations,
    columns,
    events,
    locations,
    characters,
    hangulLessons,
    listening,
    drills,
    chapterTests,
    earSets,
    stories,
    readings,
    menus,
    orders,
    chapters,
    achievements,
    furniture,
    balance,
    issues,
  }
}

/** 問題を1行の文章にする（コンソール表示用） */
export function formatIssue(issue: ValidationIssue): string {
  const where = [issue.file, issue.index === null ? null : `${issue.index}番目`, issue.id, issue.path || null].filter((s) => s !== null).join(' / ')
  return `${where}: ${issue.message}`
}
