import { describe, expect, it } from 'vitest'
import type { ReviewRecord } from '../../storage/saveData'
import { addDays, daysBetween, isDateString, localDate } from './dates'
import { dueCount, freshRecord, isMastered, parseReviewKey, reviewKey, reviewedToday, todaysReview, type ReviewSettings } from './review'

const settings: ReviewSettings = { intervalsDays: [1, 3, 7, 14, 30], masteredDays: 14, dailyLimit: 3 }
const rec = (due: string, wrong = 0, lastAt: string | null = null, stage = 0): ReviewRecord => ({ stage, due, correct: 0, wrong, lastAt })

describe('日付', () => {
  it('日数を足す・引く（月・年をまたぐ）', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(daysBetween('2026-11-20', '2026-12-04')).toBe(14)
  })

  it('端末の日付にする（その日の昼の時刻なら、どのタイムゾーンでも同じ日）', () => {
    expect(localDate('2026-11-20T12:00:00')).toBe('2026-11-20')
  })

  it('日付の形を確かめる', () => {
    expect(isDateString('2026-11-20')).toBe(true)
    expect(isDateString('2026-11-2')).toBe(false)
    expect(isDateString('2026/11/20')).toBe(false)
  })
})

describe('復習のキー', () => {
  it('作って読む', () => {
    expect(reviewKey('turn', 'cafe_001#0')).toBe('turn:cafe_001#0')
    expect(parseReviewKey('turn:cafe_001#0')).toEqual({ kind: 'turn', id: 'cafe_001#0' })
    expect(parseReviewKey('listen:x')).toBeNull()
    expect(parseReviewKey('word')).toBeNull()
  })
})

describe('今日の復習', () => {
  const today = '2026-11-20'
  const all = () => true

  it('期限の来たものだけを、間違えた回数の多い順（同じなら期限の古い順）に選ぶ', () => {
    const records = {
      'word:vocab_001': rec('2026-11-19'),
      'word:vocab_002': rec('2026-11-20', 2),
      'word:vocab_003': rec('2026-11-21', 5),
      'word:vocab_004': rec('2026-11-18'),
    }
    expect(todaysReview(records, today, settings, all)).toEqual(['word:vocab_002', 'word:vocab_004', 'word:vocab_001'])
  })

  it('1日の上限まで。今日すでに答えた数を引く', () => {
    const records = {
      a: rec('2026-11-19'),
      b: rec('2026-11-19'),
      c: rec('2026-11-19'),
      d: rec('2026-11-19'),
      done: rec('2026-11-23', 0, '2026-11-20T12:00:00', 1),
    }
    expect(reviewedToday(records, today)).toBe(1)
    expect(todaysReview(records, today, settings, all)).toHaveLength(2)
    expect(dueCount(records, today, all)).toBe(4)
  })

  it('教材がなくなった問題は出さない（記録は残す）', () => {
    const records = { 'turn:home_003#0': rec('2026-11-19'), 'turn:home_005#0': rec('2026-11-19') }
    expect(todaysReview(records, today, settings, (k) => k !== 'turn:home_003#0')).toEqual(['turn:home_005#0'])
  })
})

describe('覚えた', () => {
  it('14日の間隔で出た問題に正解したら（stage 4 以上）', () => {
    expect(isMastered(freshRecord('2026-11-20', settings), settings)).toBe(false)
    expect(isMastered(rec('2026-12-01', 0, null, 3), settings)).toBe(false)
    expect(isMastered(rec('2026-12-30', 0, null, 4), settings)).toBe(true)
  })
})
