// 成長の精算（GAME_SPEC 7-2・7-3・7-6。Phase 4）：セーブデータが変わるたびに、
// 新しく達成した実績・届いたスタンプの節目・上がったレベルを数え、実績と節目のコインを付ける。
// どれも一度だけ（達成した記録をセーブデータに残す）。日時はセーブデータの updatedAt を使う（同じデータなら同じ結果になるように）。
// v6 から移したデータ（levelShown が 0）は、これまでの学習の分（終えたイベント・章・章末テスト）のコインもさかのぼって付け、
// レベルアップの知らせは出さない（画面にはお知らせ progressionIntroduced を出す）。

import type { Achievement, AchievementConditionType, Balance, Chapter, GameEvent } from '../../data/types'
import type { SaveData } from '../../storage/saveData'
import { levelOf } from './level'

export interface GrowthContext {
  balance: Balance
  achievements: readonly Achievement[]
  events: readonly GameEvent[]
  chapters: readonly Chapter[]
}

/** すべてのイベントを終えた章の番号 */
export function clearedChapters(save: SaveData, events: readonly GameEvent[], chapters: readonly Chapter[]): number[] {
  const done = new Set(save.progress.completedEvents)
  return chapters
    .map((c) => c.chapter)
    .filter((n) => {
      const inChapter = events.filter((e) => e.chapter === n)
      return inChapter.length > 0 && inChapter.every((e) => done.has(e.id))
    })
}

const count = (o: Record<string, unknown>) => Object.keys(o).length

/** 実績の条件の、いまの値（chapterCleared は、その章を終えていれば target、まだなら 0） */
export function achievementValue(condition: Achievement['condition'], save: SaveData, ctx: Pick<GrowthContext, 'balance' | 'events' | 'chapters'>): number {
  const { learning, progress } = save
  const values: Record<AchievementConditionType, () => number> = {
    wordsLearned: () => count(learning.words),
    wordsSeen: () => count(learning.seen),
    chapterCleared: () => (clearedChapters(save, ctx.events, ctx.chapters).includes(condition.target) ? condition.target : 0),
    chapterTestsPassed: () => Object.values(learning.tests).filter((t) => t.passedAt !== null).length,
    hangulLessonsPassed: () => count(learning.hangul),
    reviewCorrect: () => Object.values(learning.review).reduce((sum, r) => sum + r.correct, 0),
    drillItemsCorrect: () => count(learning.drills),
    listeningCorrect: () => count(learning.listening),
    readingsCorrect: () => count(learning.readings),
    itemsOrdered: () => Object.values(learning.orders).reduce((sum, o) => sum + o.items.length, 0),
    storiesSeen: () => count(progress.storiesSeen),
    level: () => levelOf(save.stats.xp, ctx.balance.levels),
  }
  return values[condition.type]()
}

export function isAchieved(a: Achievement, save: SaveData, ctx: Pick<GrowthContext, 'balance' | 'events' | 'chapters'>): boolean {
  return achievementValue(a.condition, save, ctx) >= a.condition.target
}

/** これまでの学習の分のコイン（v6 から移したデータに、一度だけ付ける） */
export function retroactiveCoins(save: SaveData, ctx: Pick<GrowthContext, 'balance' | 'events' | 'chapters'>): number {
  const { coins } = ctx.balance
  const known = new Set(ctx.events.map((e) => e.id))
  const events = save.progress.completedEvents.filter((id) => known.has(id)).length
  const chapters = clearedChapters(save, ctx.events, ctx.chapters).length
  const tests = Object.values(save.learning.tests).filter((t) => t.passedAt !== null).length
  return events * coins.eventComplete + chapters * coins.chapterClear + tests * coins.chapterTest
}

export interface Growth {
  save: SaveData
  /** 付けたコイン（実績・節目。さかのぼった分も含む） */
  coins: number
  /** 新しく達成した実績のID */
  achievements: string[]
  /** 新しく届いたスタンプの節目（日数） */
  milestones: number[]
  /** 上がったレベル（知らせるもの）。上がっていなければ null */
  levelUp: number | null
  /** v6 から移したデータを、初めて精算した */
  retroactive: boolean
}

/** 成長を精算する。何も変わらなければ、同じ save を返す */
export function settleGrowth(save: SaveData, ctx: GrowthContext): Growth {
  const at = save.updatedAt
  const retroactive = save.stats.levelShown === 0
  let coins = retroactive ? retroactiveCoins(save, ctx) : 0

  const achieved: string[] = []
  const achievements = { ...save.achievements }
  for (const a of ctx.achievements) {
    if (achievements[a.id] !== undefined || !isAchieved(a, save, ctx)) continue
    achievements[a.id] = { at }
    achieved.push(a.id)
    coins += a.coins
  }

  const milestones: number[] = []
  const rewards = { ...save.daily.rewards }
  const stamps = save.daily.stamps.length
  for (const m of ctx.balance.stampMilestones) {
    const key = String(m.days)
    if (rewards[key] !== undefined || stamps < m.days) continue
    rewards[key] = { at }
    milestones.push(m.days)
    coins += m.coins
  }

  const level = levelOf(save.stats.xp, ctx.balance.levels)
  const levelUp = !retroactive && level > save.stats.levelShown ? level : null
  const levelShown = Math.max(level, retroactive ? 0 : save.stats.levelShown)

  if (!retroactive && coins === 0 && achieved.length === 0 && milestones.length === 0 && levelUp === null) {
    return { save, coins: 0, achievements: [], milestones: [], levelUp: null, retroactive: false }
  }
  const next: SaveData = {
    ...save,
    stats: { ...save.stats, coins: save.stats.coins + coins, levelShown },
    achievements,
    daily: { ...save.daily, rewards },
  }
  return { save: next, coins, achievements: achieved, milestones, levelUp, retroactive }
}
