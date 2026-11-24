import { describe, expect, it } from 'vitest'
import type { Achievement, Balance, Chapter, GameEvent } from '../../data/types'
import { DEFAULT_BALANCE } from '../../data/validate'
import { createNewSave, type SaveData } from '../../storage/saveData'
import { achievementValue, clearedChapters, retroactiveCoins, settleGrowth, type GrowthContext } from './growth'
import { levelOf, levelProgress, thresholdOf } from './level'

const T = '2026-11-25T10:00:00.000Z'
const levels: Balance['levels'] = { thresholds: [0, 100, 250, 450], stepAfter: 300 }
const balance: Balance = {
  ...DEFAULT_BALANCE,
  levels,
  coins: { eventComplete: 20, chapterClear: 50, chapterTest: 50 },
  stampMilestones: [
    { days: 3, coins: 30 },
    { days: 7, coins: 50 },
  ],
}
const ev = (id: string, chapter: number) => ({ id, chapter, steps: [] }) as unknown as GameEvent
const events = [ev('e1', 1), ev('e2', 1), ev('e3', 2)]
const chapters: Chapter[] = [
  { chapter: 1, titleJa: '一', goalJa: '' },
  { chapter: 2, titleJa: '二', goalJa: '' },
]
const ach = (id: string, type: Achievement['condition']['type'], target: number, coins: number): Achievement => ({ id, titleJa: id, descriptionJa: id, condition: { type, target }, coins, reviewed: false })
const achievements = [ach('achievement_001', 'wordsLearned', 2, 20), ach('achievement_002', 'chapterCleared', 1, 30), ach('achievement_003', 'level', 3, 40)]
const ctx: GrowthContext = { balance, achievements, events, chapters }

function save(patch: Partial<SaveData> = {}): SaveData {
  const s = createNewSave(T)
  return { ...s, ...patch }
}
const words = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`vocab_00${i}`, { learnedAt: T, chapter: 1 }]))

describe('レベル（経験値から計算する）', () => {
  it('表のとおりにレベルが上がり、表の先は stepAfter ずつ', () => {
    expect([0, 99, 100, 249, 250, 449, 450].map((xp) => levelOf(xp, levels))).toEqual([1, 1, 2, 2, 3, 3, 4])
    expect(thresholdOf(5, levels)).toBe(750)
    expect(thresholdOf(6, levels)).toBe(1050)
    expect(levelOf(1049, levels)).toBe(5)
    expect(levelOf(1050, levels)).toBe(6)
  })

  it('次のレベルまでの進み具合', () => {
    expect(levelProgress(120, levels)).toEqual({ level: 2, current: 20, needed: 150, nextAt: 250 })
    expect(levelProgress(0, levels)).toEqual({ level: 1, current: 0, needed: 100, nextAt: 100 })
  })

  it('本番の表では、第3章を終えるころ（経験値 900〜1,000）に Lv5', () => {
    expect(levelOf(900, DEFAULT_BALANCE.levels)).toBe(5)
    expect(levelOf(999, DEFAULT_BALANCE.levels)).toBe(5)
  })
})

describe('実績の条件', () => {
  it('章を終えたか：その章のイベントをすべて終えた', () => {
    const s = save({ progress: { ...save().progress, completedEvents: ['e1', 'e2'] } })
    expect(clearedChapters(s, events, chapters)).toEqual([1])
    expect(achievementValue({ type: 'chapterCleared', target: 1 }, s, ctx)).toBe(1)
    expect(achievementValue({ type: 'chapterCleared', target: 2 }, s, ctx)).toBe(0)
  })

  it('数える条件（単語・復習の正解・注文した品物・章末テストの合格など）', () => {
    const base = save()
    const s: SaveData = {
      ...base,
      learning: {
        ...base.learning,
        words: words(3),
        review: { a: { stage: 1, due: '2026-11-26', correct: 4, wrong: 0, lastAt: null }, b: { stage: 1, due: '2026-11-26', correct: 2, wrong: 1, lastAt: null } },
        orders: { order_001: { firstAt: T, items: ['americano', 'latte'] } },
        tests: { t1: { passedAt: T, bestScore: 90 }, t2: { passedAt: null, bestScore: 50 } },
      },
      stats: { ...base.stats, xp: 260 },
    }
    expect(achievementValue({ type: 'wordsLearned', target: 1 }, s, ctx)).toBe(3)
    expect(achievementValue({ type: 'reviewCorrect', target: 1 }, s, ctx)).toBe(6)
    expect(achievementValue({ type: 'itemsOrdered', target: 1 }, s, ctx)).toBe(2)
    expect(achievementValue({ type: 'chapterTestsPassed', target: 1 }, s, ctx)).toBe(1)
    expect(achievementValue({ type: 'level', target: 1 }, s, ctx)).toBe(3)
  })
})

describe('成長の精算', () => {
  it('何も達成していなければ、同じセーブデータを返す', () => {
    const s = save()
    expect(settleGrowth(s, ctx).save).toBe(s)
  })

  it('新しく達成した実績のコインを付け、記録する。2回目は付けない', () => {
    const s = save({ learning: { ...save().learning, words: words(2) } })
    const g = settleGrowth(s, ctx)
    expect(g.achievements).toEqual(['achievement_001'])
    expect(g.coins).toBe(20)
    expect(g.save.stats.coins).toBe(20)
    expect(g.save.achievements).toEqual({ achievement_001: { at: s.updatedAt } })
    expect(settleGrowth(g.save, ctx).save).toBe(g.save)
  })

  it('スタンプの合計が節目に届いたら、コインを付ける（一度だけ）', () => {
    const stamps = ['2026-11-01', '2026-11-05', '2026-11-20']
    const g = settleGrowth(save({ daily: { stamps, rewards: {} } }), ctx)
    expect(g.milestones).toEqual([3])
    expect(g.save.stats.coins).toBe(30)
    expect(g.save.daily.rewards).toEqual({ '3': { at: T } })
    expect(settleGrowth(g.save, ctx).milestones).toEqual([])
  })

  it('レベルが上がったら知らせ、レベルの実績も達成する', () => {
    const base = save()
    const g = settleGrowth({ ...base, stats: { ...base.stats, xp: 260 } }, ctx)
    expect(g.levelUp).toBe(3)
    expect(g.save.stats.levelShown).toBe(3)
    expect(g.achievements).toEqual(['achievement_003'])
    expect(settleGrowth(g.save, ctx).levelUp).toBeNull()
  })

  it('v6 から移したデータ（levelShown 0）：これまでの分のコインをさかのぼって付け、レベルアップは知らせない', () => {
    const base = save()
    const migrated: SaveData = {
      ...base,
      progress: { ...base.progress, completedEvents: ['e1', 'e2', 'unknown'] },
      learning: { ...base.learning, words: words(2), tests: { t1: { passedAt: T, bestScore: 100 } } },
      stats: { xp: 300, coins: 0, levelShown: 0 },
      daily: { stamps: ['2026-11-01', '2026-11-02', '2026-11-03'], rewards: {} },
    }
    // イベント2つ（知らないIDは数えない）×20 ＋ 章1つ×50 ＋ テスト1つ×50
    expect(retroactiveCoins(migrated, ctx)).toBe(140)
    const g = settleGrowth(migrated, ctx)
    expect(g.retroactive).toBe(true)
    expect(g.levelUp).toBeNull()
    expect(g.save.stats.levelShown).toBe(3)
    // さかのぼり 140 ＋ 実績（単語20・第1章30・レベル40）＋ 節目30
    expect(g.save.stats.coins).toBe(140 + 20 + 30 + 40 + 30)
    expect(settleGrowth(g.save, ctx).save).toBe(g.save)
  })
})
