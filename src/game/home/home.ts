// 自宅の家具（GAME_SPEC 6-3・7-3。Phase 4）：カタログで買う・部屋の場所に置く・外す。
// 買えるのは、レベルが届いていて、コインが足りていて、まだ持っていない、節目専用でない家具だけ。
// 置けるのは、持っていて、その家具の場所に合うものだけ（1か所に1つ）。

import type { Balance, Furniture, Room, RoomSlot } from '../../data/types'
import type { SaveData } from '../../storage/saveData'
import { levelOf } from '../progression/level'

/** 引っ越しを終えたか（movedInAfter のイベントを終えたら、新しい部屋を見せ、飾れるようにする） */
export function isMovedIn(progress: SaveData['progress'], room: Room): boolean {
  return progress.completedEvents.includes(room.movedInAfter)
}

/** カタログでの状態 */
export type PurchaseState =
  | { kind: 'owned' }
  /** 節目専用（カタログでは売らない） */
  | { kind: 'milestone'; days: number }
  | { kind: 'level'; level: number }
  | { kind: 'coins'; short: number }
  | { kind: 'available'; price: number }

export function purchaseState(item: Furniture, save: SaveData, levels: Balance['levels']): PurchaseState {
  if (save.home.owned[item.id] !== undefined) return { kind: 'owned' }
  if (item.milestone !== null || item.price === null || item.level === null) return { kind: 'milestone', days: item.milestone ?? 0 }
  if (levelOf(save.stats.xp, levels) < item.level) return { kind: 'level', level: item.level }
  if (save.stats.coins < item.price) return { kind: 'coins', short: item.price - save.stats.coins }
  return { kind: 'available', price: item.price }
}

/** 家具を手に入れる（買ったとき・節目でもらったとき）。その場所が空いていれば、そこに置く */
export function acquireFurniture(save: SaveData, item: Furniture, at: string): SaveData {
  if (save.home.owned[item.id] !== undefined) return save
  const placement = save.home.placement[item.slot] === undefined ? { ...save.home.placement, [item.slot]: item.id } : save.home.placement
  return { ...save, home: { owned: { ...save.home.owned, [item.id]: { at } }, placement } }
}

/** カタログで買う。買えなければ同じ save を返す */
export function buyFurniture(save: SaveData, item: Furniture, levels: Balance['levels'], now: string): SaveData {
  const state = purchaseState(item, save, levels)
  if (state.kind !== 'available') return save
  const paid: SaveData = { ...save, updatedAt: now, stats: { ...save.stats, coins: save.stats.coins - state.price } }
  return acquireFurniture(paid, item, now)
}

/** 場所に家具を置く（id が null なら外す）。持っていない・場所に合わない家具なら、同じ save を返す */
export function placeFurniture(save: SaveData, slot: string, item: Furniture | null, now: string): SaveData {
  const placement = { ...save.home.placement }
  if (item === null) {
    if (placement[slot] === undefined) return save
    delete placement[slot]
  } else {
    if (item.slot !== slot || save.home.owned[item.id] === undefined || placement[slot] === item.id) return save
    placement[slot] = item.id
  }
  return { ...save, updatedAt: now, home: { ...save.home, placement } }
}

export interface PlacedFurniture {
  slot: RoomSlot
  item: Furniture
}

/** 部屋に置いてある家具（奥から順）。持っていない・場所に合わない・知らない家具は出さない */
export function placedFurniture(save: SaveData, room: Room, furniture: readonly Furniture[]): PlacedFurniture[] {
  const placed: PlacedFurniture[] = []
  for (const slot of room.slots) {
    const id = save.home.placement[slot.id]
    const item = furniture.find((f) => f.id === id)
    if (item === undefined || item.slot !== slot.id || save.home.owned[item.id] === undefined) continue
    placed.push({ slot, item })
  }
  return placed.sort((a, b) => a.slot.layer - b.slot.layer)
}

/** レベルが from より上がって to になったときに、新しくカタログで買えるようになる家具 */
export function newlyBuyable(furniture: readonly Furniture[], from: number, to: number): Furniture[] {
  return furniture.filter((f) => f.milestone === null && f.level !== null && f.level > from && f.level <= to)
}
