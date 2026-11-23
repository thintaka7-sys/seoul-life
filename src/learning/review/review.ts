// 復習（GAME_SPEC 7-5）の予定の計算。純粋な関数だけを置く（日付は引数で受け取る）。
// - 学んだ日・間違えた日から intervalsDays[0] 日後に出す
// - 今日の復習で正解するたびに、次の間隔へ延ばす（最後の間隔はくり返す）
// - 間違えたら最初の間隔に戻す
// - 「覚えた」は、masteredDays の間隔で出た問題に正解したもの

import type { Balance } from '../../data/types'
import type { ReviewRecord } from '../../storage/saveData'
import { addDays, localDate } from './dates'

export type ReviewSettings = Balance['review']

/** 復習の問題の種類 */
export type ReviewKind = 'word' | 'grammar' | 'turn' | 'drill' | 'ear' | 'form'

const REVIEW_KINDS: readonly ReviewKind[] = ['word', 'grammar', 'turn', 'drill', 'ear', 'form']

/** 復習の記録のキー（例：word:vocab_001、turn:cafe_001#0、ear:ear_001、form:vocab_031#가요。聞き分けは組ごと、形は単語の形ごと） */
export function reviewKey(kind: ReviewKind, id: string): string {
  return `${kind}:${id}`
}

export function parseReviewKey(key: string): { kind: ReviewKind; id: string } | null {
  const at = key.indexOf(':')
  const kind = REVIEW_KINDS.find((k) => k === key.slice(0, at))
  return at < 0 || kind === undefined ? null : { kind, id: key.slice(at + 1) }
}

/** stage（続けて正解した回数）のときの、次の出題までの日数 */
export function intervalFor(stage: number, settings: ReviewSettings): number {
  const days = settings.intervalsDays
  return days[Math.min(stage, days.length - 1)] ?? 1
}

/** 学んだ（間違えた）ばかりの記録 */
export function freshRecord(today: string, settings: ReviewSettings, wrong = 0): ReviewRecord {
  return { stage: 0, due: addDays(today, intervalFor(0, settings)), correct: 0, wrong, lastAt: null }
}

/** 期限が来ているか */
export function isDue(record: ReviewRecord, today: string): boolean {
  return record.due <= today
}

/** 「覚えた」か：masteredDays 以上の間隔で出た問題に、正解したことがある */
export function isMastered(record: ReviewRecord, settings: ReviewSettings): boolean {
  return record.stage >= 1 && intervalFor(record.stage - 1, settings) >= settings.masteredDays
}

/** 今日の復習で答えた（期限の来た問題）。正解なら次の間隔へ、間違いなら最初の間隔へ */
export function answerScheduled(record: ReviewRecord, correct: boolean, today: string, now: string, settings: ReviewSettings): ReviewRecord {
  if (correct) {
    const stage = record.stage + 1
    return { ...record, stage, due: addDays(today, intervalFor(stage, settings)), correct: record.correct + 1, lastAt: now }
  }
  return { ...record, stage: 0, due: addDays(today, intervalFor(0, settings)), wrong: record.wrong + 1, lastAt: now }
}

/**
 * 期限の来ていない問題を間違えた（練習・ドリル・テスト・「答えを見る」）。最初の間隔に戻す（記録がなければ作る）。
 * 今日の復習の上限には数えない（lastAt は変えない）
 */
export function recordMistake(record: ReviewRecord | undefined, today: string, settings: ReviewSettings): ReviewRecord {
  if (record === undefined) return freshRecord(today, settings, 1)
  return { ...record, stage: 0, due: addDays(today, intervalFor(0, settings)), wrong: record.wrong + 1 }
}

/** 今日、今日の復習で答えた問題の数 */
export function reviewedToday(records: Readonly<Record<string, ReviewRecord>>, today: string): number {
  return Object.values(records).filter((r) => r.lastAt !== null && localDate(r.lastAt) === today).length
}

/**
 * 今日の復習に出す問題のキー。期限が来ていて、教材が今もある（exists）ものから、
 * 間違えた回数の多い順（同じなら期限の古い順）に、1日の上限の残りの数だけ選ぶ
 */
export function todaysReview(records: Readonly<Record<string, ReviewRecord>>, today: string, settings: ReviewSettings, exists: (key: string) => boolean): string[] {
  const remaining = Math.max(0, settings.dailyLimit - reviewedToday(records, today))
  return Object.entries(records)
    .filter(([key, r]) => isDue(r, today) && exists(key))
    .sort(([ka, a], [kb, b]) => b.wrong - a.wrong || a.due.localeCompare(b.due) || ka.localeCompare(kb))
    .slice(0, remaining)
    .map(([key]) => key)
}

/** 期限が来ていて、教材が今もある問題の数（1日の上限を超えた分も含む） */
export function dueCount(records: Readonly<Record<string, ReviewRecord>>, today: string, exists: (key: string) => boolean): number {
  return Object.entries(records).filter(([key, r]) => isDue(r, today) && exists(key)).length
}
