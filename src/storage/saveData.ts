// セーブデータの形。形式を変えるときは:
// 1. 新しいバージョンの型を追加し、CURRENT_SAVE_VERSION を上げる
// 2. migrations.ts に「旧バージョン → 新バージョン」の変換を追加する
// 3. 変換のテストを書く

import { isDateString } from '../learning/review/dates'

export const CURRENT_SAVE_VERSION = 7

/** v1（Phase 0）。移行のために型を残しておく */
export interface SaveDataV1 {
  version: 1
  createdAt: string
  updatedAt: string
  progress: {
    currentLocationId: string | null
  }
}

/** 覚えた単語・文法の記録 */
export interface LearnedRecord {
  /** 初めて覚えた日時（ISO形式） */
  learnedAt: string
  /** 覚えたときの章（フリガナの表示の判定に使う） */
  chapter: number
}

/** 会話をどの方法で正解したか（経験値を二重に付けないため） */
export interface ConversationRecord {
  choice: boolean
  write: boolean
}

/** ハングルのレッスンの記録（小テストに合格したレッスンだけ） */
export interface HangulLessonRecord {
  /** 初めて合格した日時（ISO形式） */
  passedAt: string
  /** 小テストのいちばん良い点（0〜100） */
  bestScore: number
}

/** リスニングの問題の記録（経験値を初回だけにするため） */
export interface ListeningRecord {
  /** 初めて正解した日時（ISO形式） */
  correctAt: string
}

/**
 * 復習の記録（GAME_SPEC 7-5）。問題ごと（キーは reviewKey：word:vocab_001・grammar:grammar_001・turn:cafe_001#0・drill:dq_001）
 */
export interface ReviewRecord {
  /** 続けて正解した回数。次の出題までの間隔は balance の review.intervalsDays[stage]（最後の間隔はくり返す） */
  stage: number
  /** 次に出題する日（端末の日付。YYYY-MM-DD） */
  due: string
  /** 正解した回数（今日の復習で） */
  correct: number
  /** 間違えた回数（今日の復習・練習・ドリル・テスト・「答えを見る」） */
  wrong: number
  /** 最後に今日の復習で答えた日時（ISO形式）。まだなら null。1日の上限の計算に使う */
  lastAt: string | null
}

/** 基礎ドリルの問題の記録（経験値を初回だけにするため） */
export interface DrillRecord {
  /** 初めて正解した日時（ISO形式） */
  correctAt: string
}

/** 章末テストの記録 */
export interface TestRecord {
  /** 初めて合格した日時（ISO形式）。まだ合格していなければ null */
  passedAt: string | null
  /** いちばん良い点（0〜100） */
  bestScore: number
}

/** v2（Phase 1）・v3（Phase 1.5）。v3 は会話の記録を往復ごとにした（キーが「会話ID#往復の番号」） */
interface SaveDataBody {
  /** 最初に始めた日時（ISO形式） */
  createdAt: string
  /** 最後に保存した日時（ISO形式） */
  updatedAt: string
  progress: {
    /** いま入っている施設のID。街（マップ）にいるときは null */
    currentLocationId: string | null
    /** 終えたイベントのID（終えた順） */
    completedEvents: string[]
    /** 途中のイベント。step は「次に行う段階」の番号（0始まり） */
    activeEvent: { id: string; step: number } | null
  }
  learning: {
    /** 単語ID → 記録（図鑑） */
    words: Record<string, LearnedRecord>
    /** 文法ID → 記録 */
    grammar: Record<string, LearnedRecord>
    /** 「会話ID#往復の番号」（例：cafe_001#0）→ 記録。v2 では会話ID → 記録 */
    conversations: Record<string, ConversationRecord>
  }
  stats: {
    xp: number
  }
}

/** v2（Phase 1）。移行のために型を残しておく */
export interface SaveDataV2 extends SaveDataBody {
  version: 2
}

/** v3（Phase 1.5）。移行のために型を残しておく */
export interface SaveDataV3 extends SaveDataBody {
  version: 3
}

/** v4（Phase 2）：ハングルのレッスンとリスニングの記録を追加 */
export interface SaveDataV4 extends Omit<SaveDataBody, 'learning'> {
  version: 4
  learning: SaveDataBody['learning'] & {
    /** レッスンID → 記録 */
    hangul: Record<string, HangulLessonRecord>
    /** 問題のキー（listeningKey）→ 記録 */
    listening: Record<string, ListeningRecord>
  }
}

/** v5（Phase 2.5）：復習・ドリル・章末テストの記録と、毎日のスタンプを追加 */
export interface SaveDataV5 extends Omit<SaveDataV4, 'version' | 'learning'> {
  version: 5
  learning: SaveDataV4['learning'] & {
    /** 復習のキー → 記録 */
    review: Record<string, ReviewRecord>
    /** ドリル・テストの問題ID（dq_001）→ 記録 */
    drills: Record<string, DrillRecord>
    /** 章末テストのID → 記録 */
    tests: Record<string, TestRecord>
  }
  daily: {
    /** スタンプを押した日付（端末の日付。YYYY-MM-DD。古い順） */
    stamps: string[]
  }
}

/** 見かけた単語の記録（おはなし・読み物・台詞で単語をタップして「覚える」を押したもの。GAME_SPEC 4-8） */
export interface SeenRecord {
  /** 「覚える」を押した日時（ISO形式） */
  seenAt: string
  /** そのときの章（フリガナの表示の判定に使う） */
  chapter: number
}

/** 見たおはなしの記録（おはなしのアルバム。GAME_SPEC 3-2） */
export interface StorySeenRecord {
  /** 初めて最後まで見た日時（ISO形式） */
  seenAt: string
}

/** 注文の記録（経験値を初回だけにするため） */
export interface OrderRecord {
  /** 初めて注文できた日時（ISO形式） */
  firstAt: string
  /** これまでに注文した品物のキー（メニューの key） */
  items: string[]
}

/**
 * 一度だけ画面に出すお知らせ。
 * - storyRestructured：物語が章立てに変わり、進み具合を最初からにした（v6）
 * - progressionIntroduced：レベル・コイン・実績が加わった。これまでの学習の分をさかのぼって付けた（v7）
 */
export const SAVE_NOTICES = ['storyRestructured', 'progressionIntroduced'] as const
export type SaveNotice = (typeof SAVE_NOTICES)[number]

/** v6（Phase 3）：おはなし・見かけた単語・読み物・注文・形が変わる言葉の記録と、一度だけのお知らせを追加 */
export interface SaveDataV6 extends Omit<SaveDataV5, 'version' | 'progress' | 'learning'> {
  version: 6
  progress: SaveDataV5['progress'] & {
    /** おはなしID → 見た記録 */
    storiesSeen: Record<string, StorySeenRecord>
    /** まだ出していないお知らせ */
    notices: SaveNotice[]
  }
  learning: SaveDataV5['learning'] & {
    /** 単語ID → 見かけた記録（図鑑で「覚えた」単語とは別） */
    seen: Record<string, SeenRecord>
    /** 読み物の問題のキー（reading_001#0）→ 初めて正解した記録 */
    readings: Record<string, DrillRecord>
    /** 注文ID → 記録 */
    orders: Record<string, OrderRecord>
    /** 形が変わる言葉の問題のキー → 初めて正解した記録 */
    forms: Record<string, DrillRecord>
  }
}

/** 日時だけの記録（実績・家具・節目のごほうびを受け取った日時） */
export interface DatedRecord {
  /** 受け取った日時（ISO形式） */
  at: string
}

/** v7（Phase 4）：コイン・レベルの知らせ・実績・自宅の家具・スタンプの節目のごほうびを追加 */
export interface SaveDataV7 extends Omit<SaveDataV6, 'version' | 'stats' | 'daily'> {
  version: 7
  stats: {
    xp: number
    /** コイン（GAME_SPEC 7-3） */
    coins: number
    /** 知らせ済みのレベル（レベルは経験値から計算する）。0 は、v6 から移したばかりで、まだ数えていない */
    levelShown: number
  }
  /** 実績ID → 達成した記録 */
  achievements: Record<string, DatedRecord>
  /** 自宅（GAME_SPEC 6-3） */
  home: {
    /** 家具ID → 手に入れた記録 */
    owned: Record<string, DatedRecord>
    /** 部屋の場所 → 置いた家具ID */
    placement: Record<string, string>
  }
  daily: {
    /** スタンプを押した日（YYYY-MM-DD） */
    stamps: string[]
    /** 受け取ったスタンプの節目（日数の文字列 → 記録） */
    rewards: Record<string, DatedRecord>
  }
}

/** 現在のバージョンのセーブデータ */
export type SaveData = SaveDataV7

/** 会話の記録のキー（会話ID#往復の番号） */
export function conversationTurnKey(conversationId: string, turn: number): string {
  return `${conversationId}#${turn}`
}

export function createNewSave(nowIso: string): SaveData {
  return {
    version: 7,
    createdAt: nowIso,
    updatedAt: nowIso,
    progress: { currentLocationId: null, completedEvents: [], activeEvent: null, storiesSeen: {}, notices: [] },
    learning: { words: {}, grammar: {}, conversations: {}, hangul: {}, listening: {}, review: {}, drills: {}, tests: {}, seen: {}, readings: {}, orders: {}, forms: {} },
    stats: { xp: 0, coins: 0, levelShown: 1 },
    achievements: {},
    home: { owned: {}, placement: {} },
    daily: { stamps: [], rewards: {} },
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function isRecordOf(v: unknown, check: (item: unknown) => boolean): boolean {
  return isObj(v) && Object.values(v).every(check)
}

function isLearnedRecord(v: unknown): boolean {
  return isObj(v) && isIsoDate(v['learnedAt']) && isNonNegativeInt(v['chapter'])
}

function isConversationRecord(v: unknown): boolean {
  return isObj(v) && typeof v['choice'] === 'boolean' && typeof v['write'] === 'boolean'
}

function isHangulLessonRecord(v: unknown): boolean {
  const score = isObj(v) ? v['bestScore'] : undefined
  return isObj(v) && isIsoDate(v['passedAt']) && isNonNegativeInt(score) && score <= 100
}

/** 初めて正解した日時の記録（リスニング・ドリル） */
function isCorrectAtRecord(v: unknown): boolean {
  return isObj(v) && isIsoDate(v['correctAt'])
}

function isReviewRecord(v: unknown): boolean {
  if (!isObj(v)) return false
  const lastAt = v['lastAt']
  return isNonNegativeInt(v['stage']) && isDateString(v['due']) && isNonNegativeInt(v['correct']) && isNonNegativeInt(v['wrong']) && (lastAt === null || isIsoDate(lastAt))
}

function isSeenRecord(v: unknown): boolean {
  return isObj(v) && isIsoDate(v['seenAt']) && isNonNegativeInt(v['chapter'])
}

function isStorySeenRecord(v: unknown): boolean {
  return isObj(v) && isIsoDate(v['seenAt'])
}

function isOrderRecord(v: unknown): boolean {
  const items = isObj(v) ? v['items'] : undefined
  return isObj(v) && isIsoDate(v['firstAt']) && Array.isArray(items) && items.every((i) => typeof i === 'string')
}

function isDatedRecord(v: unknown): boolean {
  return isObj(v) && isIsoDate(v['at'])
}

function isTestRecord(v: unknown): boolean {
  if (!isObj(v)) return false
  const passedAt = v['passedAt']
  const score = v['bestScore']
  return (passedAt === null || isIsoDate(passedAt)) && isNonNegativeInt(score) && score <= 100
}

/** 現在のバージョンのセーブデータとして正しい形かを確かめる */
export function isSaveData(v: unknown): v is SaveData {
  if (!isObj(v)) return false
  if (v['version'] !== CURRENT_SAVE_VERSION) return false
  if (!isIsoDate(v['createdAt']) || !isIsoDate(v['updatedAt'])) return false

  const progress = v['progress']
  if (!isObj(progress)) return false
  const loc = progress['currentLocationId']
  if (!(loc === null || typeof loc === 'string')) return false
  const completed = progress['completedEvents']
  if (!Array.isArray(completed) || !completed.every((e) => typeof e === 'string')) return false
  const active = progress['activeEvent']
  if (!(active === null || (isObj(active) && typeof active['id'] === 'string' && isNonNegativeInt(active['step'])))) return false
  if (!isRecordOf(progress['storiesSeen'], isStorySeenRecord)) return false
  const notices = progress['notices']
  if (!Array.isArray(notices) || !notices.every((n) => (SAVE_NOTICES as readonly unknown[]).includes(n))) return false

  const learning = v['learning']
  if (!isObj(learning)) return false
  if (!isRecordOf(learning['words'], isLearnedRecord)) return false
  if (!isRecordOf(learning['grammar'], isLearnedRecord)) return false
  if (!isRecordOf(learning['conversations'], isConversationRecord)) return false
  if (!isRecordOf(learning['hangul'], isHangulLessonRecord)) return false
  if (!isRecordOf(learning['listening'], isCorrectAtRecord)) return false
  if (!isRecordOf(learning['review'], isReviewRecord)) return false
  if (!isRecordOf(learning['drills'], isCorrectAtRecord)) return false
  if (!isRecordOf(learning['tests'], isTestRecord)) return false
  if (!isRecordOf(learning['seen'], isSeenRecord)) return false
  if (!isRecordOf(learning['readings'], isCorrectAtRecord)) return false
  if (!isRecordOf(learning['orders'], isOrderRecord)) return false
  if (!isRecordOf(learning['forms'], isCorrectAtRecord)) return false

  const stats = v['stats']
  if (!isObj(stats) || !isNonNegativeInt(stats['xp']) || !isNonNegativeInt(stats['coins']) || !isNonNegativeInt(stats['levelShown'])) return false
  if (!isRecordOf(v['achievements'], isDatedRecord)) return false
  const home = v['home']
  if (!isObj(home) || !isRecordOf(home['owned'], isDatedRecord) || !isRecordOf(home['placement'], (id) => typeof id === 'string')) return false

  const daily = v['daily']
  return isObj(daily) && Array.isArray(daily['stamps']) && daily['stamps'].every(isDateString) && isRecordOf(daily['rewards'], isDatedRecord)
}
