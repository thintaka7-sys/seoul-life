// セーブデータの形。形式を変えるときは:
// 1. 新しいバージョンの型を追加し、CURRENT_SAVE_VERSION を上げる
// 2. migrations.ts に「旧バージョン → 新バージョン」の変換を追加する
// 3. 変換のテストを書く

export const CURRENT_SAVE_VERSION = 4

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

/** 現在のバージョンのセーブデータ */
export type SaveData = SaveDataV4

/** 会話の記録のキー（会話ID#往復の番号） */
export function conversationTurnKey(conversationId: string, turn: number): string {
  return `${conversationId}#${turn}`
}

export function createNewSave(nowIso: string): SaveData {
  return {
    version: 4,
    createdAt: nowIso,
    updatedAt: nowIso,
    progress: { currentLocationId: null, completedEvents: [], activeEvent: null },
    learning: { words: {}, grammar: {}, conversations: {}, hangul: {}, listening: {} },
    stats: { xp: 0 },
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

function isListeningRecord(v: unknown): boolean {
  return isObj(v) && isIsoDate(v['correctAt'])
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
  if (!isRecordOf(learning['listening'], isListeningRecord)) return false

  const stats = v['stats']
  return isObj(stats) && isNonNegativeInt(stats['xp'])
}
