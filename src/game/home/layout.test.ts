import { describe, expect, it } from 'vitest'
import type { Room, RoomSlot } from '../../data/types'
import { furnitureRect, lightAngle, metreAt, toneSampleRect, unionRect } from './layout'

const room: Room = {
  movedInAfter: 'event_001',
  perspective: { a: 0.5, b: 10, wallFloorY: 50 },
  light: { x: 50, y: 30 },
  occluders: [],
  slots: [],
}
const ASPECT = 2 // 部屋の絵は 高さ＝幅×2
const wall: RoomSlot = { id: 'wall_left', nameJa: '壁', kind: 'wall', x: 20, y: 30, maxW: 10, maxH: 12, layer: 2 }
const floor: RoomSlot = { id: 'floor_left', nameJa: '床', kind: 'floor', x: 30, y: 90, scale: 0.8, layer: 6 }
const rug: RoomSlot = { id: 'rug', nameJa: 'ラグ', kind: 'rug', x: 50, y: 80, layer: 1 }

describe('家具を置く位置と大きさ', () => {
  it('1m の長さは、奥（y が小さい）ほど短い', () => {
    expect(metreAt(room, 50)).toBe(30)
    expect(metreAt(room, 90)).toBe(50)
  })

  it('壁の物：奥の壁での本当の大きさで、中心に置く。最大の大きさを超えなければ縮めない', () => {
    // 0.3m × 30%/m = 9% の幅。高さは 9 × 1（正方形の絵）÷ 2 = 4.5%
    expect(furnitureRect(wall, { size: 0.3 }, 1, room, ASPECT)).toEqual({ x: 15.5, y: 27.75, w: 9, h: 4.5 })
  })

  it('壁の物：最大の幅・高さを超えれば、縦横の比を変えずに縮める', () => {
    const r = furnitureRect(wall, { size: 1 }, 4, room, ASPECT) // 幅30%・高さ60% → 高さ12%に合わせる
    expect(r.h).toBeCloseTo(12)
    expect(r.w).toBeCloseTo(6)
    expect(r.x + r.w / 2).toBeCloseTo(20)
    expect(r.y + r.h / 2).toBeCloseTo(30)
  })

  it('床の物：床に触れる所が絵の下の辺の中央。奥行きと scale で大きさを決める', () => {
    // 0.5m × 50%/m × 0.8 = 20% の幅、高さ 20 × 0.5 ÷ 2 = 5%
    expect(furnitureRect(floor, { size: 0.5 }, 0.5, room, ASPECT)).toEqual({ x: 20, y: 85, w: 20, h: 5 })
  })

  it('ラグ：中心に置き、奥行きで大きさを決める（scale がなければ 1）', () => {
    // 1m × 45%/m = 45%、高さ 45 × 0.6 ÷ 2 = 13.5%
    const r = furnitureRect(rug, { size: 1 }, 0.6, room, ASPECT)
    expect(r.w).toBeCloseTo(45)
    expect(r.h).toBeCloseTo(13.5)
    expect(r.x).toBeCloseTo(27.5)
    expect(r.y).toBeCloseTo(73.25)
  })

  it('いくつかの範囲を囲む範囲（なければ null）', () => {
    expect(unionRect([])).toBeNull()
    expect(unionRect([{ x: 10, y: 10, w: 5, h: 5 }, { x: 12, y: 2, w: 10, h: 4 }])).toEqual({ x: 10, y: 2, w: 12, h: 13 })
  })
})

describe('部屋になじませる', () => {
  it('光の向きは、窓から家具へ向かう向き（真下なら 180°、右なら 90°、左上なら -45°）', () => {
    expect(lightAngle({ x: 45, y: 60, w: 10, h: 10 }, room, ASPECT)).toBeCloseTo(180)
    expect(lightAngle({ x: 75, y: 25, w: 10, h: 10 }, room, ASPECT)).toBeCloseTo(90)
    expect(lightAngle({ x: 35, y: 20, w: 10, h: 10 }, room, ASPECT)).toBeCloseTo(-45)
  })

  it('色を測る範囲：壁の物は絵のまわり、床の物は絵の下のほうとその下の床', () => {
    expect(toneSampleRect(wall, { x: 10, y: 20, w: 10, h: 10 })).toEqual({ x: 8, y: 19, w: 14, h: 12 })
    expect(toneSampleRect(floor, { x: 10, y: 80, w: 20, h: 10 })).toEqual({ x: 10, y: 86, w: 20, h: 7 })
    expect(toneSampleRect(floor, { x: 10, y: 88, w: 20, h: 10 }).h).toBeCloseTo(6)
  })
})
