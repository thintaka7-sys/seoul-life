// セーブデータの形。形式を変えるときは:
// 1. 新しいバージョンの型を追加し、CURRENT_SAVE_VERSION を上げる
// 2. migrations.ts に「旧バージョン → 新バージョン」の変換を追加する
// 3. 変換のテストを書く

import { isDateString } from '../learning/review/dates'

export const CURRENT_SAVE_VERSION = 5

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

/** 現在のバージョンのセーブデータ */
export type SaveData = SaveDataV5

/** 会話の記録のキー（会話ID#往復の番号） */
export function conversationTurnKey(conversationId: string, turn: number): string {
  return `${conversationId}#${turn}`
}

export function createNewSave(nowIso: string): SaveData {
  return {
    version: 5,
    createdAt: nowIso,
    updatedAt: nowIso,
    progress: { currentLocationId: null, completedEvents: [], activeEvent: null },
    learning: { words: {}, grammar: {}, conversations: {}, hangul: {}, listening: {}, review: {}, drills: {}, tests: {} },
    stats: { xp: 0 },
    daily: { stamps: [] },
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

  const stats = v['stats']
  if (!isObj(stats) || !isNonNegativeInt(stats['xp'])) return false

  const daily = v['daily']
  return isObj(daily) && Array.isArray(daily['stamps']) && daily['stamps'].every(isDateString)
}
