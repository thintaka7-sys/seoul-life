// 部屋に家具を置く位置と大きさ（docs/PHASE4_HOME_PLAN.md 2-1）。
// 位置・大きさは、部屋の絵の幅・高さに対する割合（%）。家具は本当の幅（size、m）と、置く所の奥行きから大きさを決める。
// e2e（scripts/e2e/phase4.mjs）からも読むので、型以外は import しない。

import type { Furniture, Room, RoomSlot } from '../../data/types'

export interface RoomRect {
  x: number
  y: number
  w: number
  h: number
}

/** 床の高さ y（%）の所での 1m の長さ（絵の幅に対する %） */
export function metreAt(room: Room, y: number): number {
  return room.perspective.a * (y + room.perspective.b)
}

/**
 * 家具の絵を置く範囲（%）。
 * ratio は家具の絵の 高さ÷幅、roomAspect は部屋の絵の 高さ÷幅（%の幅と高さをそろえるため）。
 * wall：奥の壁での本当の大きさ（maxW・maxH を超えれば縮める）で、(x, y) を中心にする。
 * floor：(x, y) を床に触れる所（下の辺の中央）にする。rug：(x, y) を中心にする。どちらも奥ほど小さく、scale を掛ける
 */
export function furnitureRect(slot: RoomSlot, item: Pick<Furniture, 'size'>, ratio: number, room: Room, roomAspect: number): RoomRect {
  const heightOf = (w: number) => (w * ratio) / roomAspect
  if (slot.kind === 'wall') {
    let w = item.size * metreAt(room, room.perspective.wallFloorY) * (slot.scale ?? 1)
    let h = heightOf(w)
    const k = Math.min(1, (slot.maxW ?? w) / w, (slot.maxH ?? h) / h)
    w *= k
    h *= k
    return { x: slot.x - w / 2, y: slot.y - h / 2, w, h }
  }
  const w = item.size * metreAt(room, slot.y) * (slot.scale ?? 1)
  const h = heightOf(w)
  return slot.kind === 'floor' ? { x: slot.x - w / 2, y: slot.y - h, w, h } : { x: slot.x - w / 2, y: slot.y - h / 2, w, h }
}

/** いくつかの範囲をすべて囲む範囲（部屋を飾る画面で、場所の枠に使う） */
export function unionRect(rects: readonly RoomRect[]): RoomRect | null {
  if (rects.length === 0) return null
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.w))
  const y1 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * 光の向き（CSS の linear-gradient の角度。0deg が上、時計回り）。窓から家具の中心へ向かう向きで、
 * 0% の所（窓側）を明るく、100% の所（反対側）を暗くする
 */
export function lightAngle(rect: RoomRect, room: Room, roomAspect: number): number {
  const dx = rect.x + rect.w / 2 - room.light.x
  const dy = (rect.y + rect.h / 2 - room.light.y) * roomAspect
  return (Math.atan2(dx, -dy) * 180) / Math.PI
}

/**
 * 家具のまわりで、部屋の色を測る範囲（家具に、その場所の光の色をのせるため）。
 * 壁の物は絵のまわり、床の物・ラグは絵の下のほうと、その下の床
 */
export function toneSampleRect(slot: RoomSlot, rect: RoomRect): RoomRect {
  if (slot.kind === 'wall') return { x: rect.x - 2, y: rect.y - 1, w: rect.w + 4, h: rect.h + 2 }
  const top = rect.y + rect.h * 0.6
  return { x: rect.x, y: top, w: rect.w, h: Math.min(100, rect.y + rect.h + 3) - top }
}
