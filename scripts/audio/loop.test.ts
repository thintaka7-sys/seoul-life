import { describe, expect, it } from 'vitest'
import { bodyLevel, findLoopRange, rmsWindows } from './loop.ts'

describe('findLoopRange', () => {
  it('最初の無音を飛ばし、フェードアウトが始まる手前で切る', () => {
    // 1区切り＝0.5秒。最初の1秒は無音、10秒は同じ大きさ、最後の3秒でだんだん小さくなる
    const rms = [0, 0, ...Array.from({ length: 20 }, () => 0.3), 0.25, 0.15, 0.08, 0.03, 0.01, 0]
    expect(bodyLevel(rms)).toBeCloseTo(0.3)
    expect(findLoopRange(rms, 0.5)).toEqual({ start: 1, end: 11.5 })
  })

  it('最後まで同じ大きさなら、最後まで使う', () => {
    expect(findLoopRange([0.2, 0.2, 0.2, 0.2], 1)).toEqual({ start: 0, end: 4 })
  })

  it('すべて無音なら、全体を使う', () => {
    expect(findLoopRange([0, 0, 0], 1)).toEqual({ start: 0, end: 3 })
  })
})

describe('rmsWindows', () => {
  it('16ビットの音を区切りごとの RMS にする', () => {
    const pcm = new Uint8Array(8)
    const view = new DataView(pcm.buffer)
    view.setInt16(0, 16384, true)
    view.setInt16(2, -16384, true)
    view.setInt16(4, 0, true)
    view.setInt16(6, 0, true)
    const r = rmsWindows(pcm, 2)
    expect(r[0]).toBeCloseTo(0.5)
    expect(r[1]).toBe(0)
  })
})
