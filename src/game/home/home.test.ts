import { describe, expect, it } from 'vitest'
import type { Balance, Furniture } from '../../data/types'
import { DEFAULT_BALANCE } from '../../data/validate'
import { createNewSave, type SaveData } from '../../storage/saveData'
import { settleGrowth } from '../progression/growth'
import { acquireFurniture, buyFurniture, isMovedIn, newlyBuyable, placeFurniture, placedFurniture, purchaseState } from './home'

const T = '2026-11-25T10:00:00.000Z'
const NOW = '2026-11-26T09:00:00.000Z'
const levels: Balance['levels'] = { thresholds: [0, 100, 250, 450], stepAfter: 300 }
const room = DEFAULT_BALANCE.room

const item = (id: string, slot: string, price: number | null, level: number | null, milestone: number | null = null): Furniture => ({
  id,
  nameJa: id,
  slot,
  price,
  level,
  milestone,
  image: id.replace('furniture', 'img'),
  vocab: null,
  reviewed: false,
})
const clock = item('furniture_001', 'wall_left', 80, 1)
const poster = item('furniture_002', 'wall_left', 100, 2)
const rug = item('furniture_016', 'rug', 120, 3)
const gift = item('furniture_018', 'wall_left', null, null, 7)
const furniture = [clock, poster, rug, gift]

function save(coins: number, xp = 0, patch: Partial<SaveData> = {}): SaveData {
  const s = createNewSave(T)
  return { ...s, stats: { ...s.stats, coins, xp }, ...patch }
}

describe('引っ越し', () => {
  it('movedInAfter のイベントを終えたら、引っ越しを終えた', () => {
    const s = save(0)
    expect(isMovedIn(s.progress, room)).toBe(false)
    expect(isMovedIn({ ...s.progress, completedEvents: [room.movedInAfter] }, room)).toBe(true)
  })
})

describe('カタログで買う', () => {
  it('レベル・コインが足りていれば買え、コインが減り、空いた場所に置かれる', () => {
    const s = save(200)
    expect(purchaseState(clock, s, levels)).toEqual({ kind: 'available', price: 80 })
    const bought = buyFurniture(s, clock, levels, NOW)
    expect(bought.stats.coins).toBe(120)
    expect(bought.home.owned['furniture_001']).toEqual({ at: NOW })
    expect(bought.home.placement['wall_left']).toBe('furniture_001')
    expect(bought.updatedAt).toBe(NOW)
    expect(purchaseState(clock, bought, levels)).toEqual({ kind: 'owned' })
  })

  it('同じ場所にもう置いてあれば、買っても置き換えない（持ち物に入る）', () => {
    const first = buyFurniture(save(500, 100), clock, levels, NOW)
    const second = buyFurniture(first, poster, levels, NOW)
    expect(second.home.owned['furniture_002']).toBeDefined()
    expect(second.home.placement['wall_left']).toBe('furniture_001')
  })

  it('レベルが足りない・コインが足りない・持っている・節目専用は買えない（同じ save のまま）', () => {
    const s = save(1000, 0)
    expect(purchaseState(poster, s, levels)).toEqual({ kind: 'level', level: 2 })
    expect(buyFurniture(s, poster, levels, NOW)).toBe(s)
    const poor = save(50)
    expect(purchaseState(clock, poor, levels)).toEqual({ kind: 'coins', short: 30 })
    expect(buyFurniture(poor, clock, levels, NOW)).toBe(poor)
    expect(purchaseState(gift, s, levels)).toEqual({ kind: 'milestone', days: 7 })
    expect(buyFurniture(s, gift, levels, NOW)).toBe(s)
    const owned = buyFurniture(s, clock, levels, NOW)
    expect(buyFurniture(owned, clock, levels, NOW)).toBe(owned)
  })

  it('レベルが上がって新しく買えるようになる家具（節目専用は入れない）', () => {
    expect(newlyBuyable(furniture, 1, 3).map((f) => f.id)).toEqual(['furniture_002', 'furniture_016'])
    expect(newlyBuyable(furniture, 2, 3).map((f) => f.id)).toEqual(['furniture_016'])
    expect(newlyBuyable(furniture, 3, 3)).toEqual([])
  })
})

describe('置く・外す', () => {
  const owning = acquireFurniture(acquireFurniture(save(0), clock, T), poster, T)

  it('持っていて、場所に合う家具を置き換える。外すこともできる', () => {
    const swapped = placeFurniture(owning, 'wall_left', poster, NOW)
    expect(swapped.home.placement['wall_left']).toBe('furniture_002')
    const removed = placeFurniture(swapped, 'wall_left', null, NOW)
    expect(removed.home.placement['wall_left']).toBeUndefined()
    expect(removed.home.owned['furniture_002']).toBeDefined()
  })

  it('持っていない・場所に合わない・同じものを置く・置いていない場所を外す、は何もしない', () => {
    expect(placeFurniture(owning, 'wall_left', gift, NOW)).toBe(owning)
    expect(placeFurniture(owning, 'rug', poster, NOW)).toBe(owning)
    expect(placeFurniture(owning, 'wall_left', clock, NOW)).toBe(owning)
    expect(placeFurniture(owning, 'rug', null, NOW)).toBe(owning)
  })

  it('部屋に置いてある家具は、奥から順（ラグが先）。データにない・場所に合わない・持っていないものは出さない', () => {
    let s = acquireFurniture(acquireFurniture(save(0), clock, T), rug, T)
    expect(placedFurniture(s, room, furniture).map((p) => p.slot.id)).toEqual(['rug', 'wall_left'])
    s = { ...s, home: { ...s.home, placement: { ...s.home.placement, wall_right: 'furniture_001', window: 'furniture_999', floor_left: 'furniture_002' } } }
    expect(placedFurniture(s, room, furniture).map((p) => `${p.slot.id}:${p.item.id}`)).toEqual(['rug:furniture_016', 'wall_left:furniture_001'])
  })
})

describe('節目専用の家具', () => {
  const balance: Balance = { ...DEFAULT_BALANCE, levels, stampMilestones: [{ days: 3, coins: 30 }, { days: 7, coins: 50 }] }
  const ctx = { balance, achievements: [], events: [], chapters: [], furniture }
  const stamps = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)

  it('節目に届いたら、コインと一緒にもらい、空いていれば置く', () => {
    const s = save(0, 0, { daily: { stamps: stamps(7), rewards: {} } })
    const g = settleGrowth(s, ctx)
    expect(g.milestones).toEqual([3, 7])
    expect(g.furniture).toEqual(['furniture_018'])
    expect(g.save.home.owned['furniture_018']).toEqual({ at: s.updatedAt })
    expect(g.save.home.placement['wall_left']).toBe('furniture_018')
    expect(settleGrowth(g.save, ctx).save).toBe(g.save)
  })

  it('前に受け取った節目（家具が入る前）の家具も、あとから渡す', () => {
    const s = save(0, 0, { daily: { stamps: stamps(8), rewards: { '3': { at: T }, '7': { at: T } } } })
    const g = settleGrowth(s, ctx)
    expect(g.coins).toBe(0)
    expect(g.milestones).toEqual([])
    expect(g.furniture).toEqual(['furniture_018'])
  })

  it('節目に届いていなければ、もらわない', () => {
    const g = settleGrowth(save(0, 0, { daily: { stamps: stamps(6), rewards: {} } }), ctx)
    expect(g.furniture).toEqual([])
    expect(g.save.home.owned['furniture_018']).toBeUndefined()
  })

  it('レベルが上がったら、新しく買えるようになった家具を知らせる', () => {
    const s = save(0, 260, { stats: { xp: 260, coins: 0, levelShown: 1 } })
    const g = settleGrowth(s, ctx)
    expect(g.levelUp).toBe(3)
    expect(g.catalog).toEqual(['furniture_002', 'furniture_016'])
  })
})
