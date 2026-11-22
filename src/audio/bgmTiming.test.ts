import { describe, expect, it } from 'vitest'
import { LOOP_CROSSFADE_SEC, loopDue } from './bgmTiming'

describe('loopDue', () => {
  it('曲の終わりの、重ねる長さの手前から true', () => {
    expect(loopDue(100, 140)).toBe(false)
    expect(loopDue(140 - LOOP_CROSSFADE_SEC - 0.1, 140)).toBe(false)
    expect(loopDue(140 - LOOP_CROSSFADE_SEC, 140)).toBe(true)
    expect(loopDue(139.9, 140)).toBe(true)
  })

  it('重ねる長さより短すぎる曲では、重ねない', () => {
    expect(loopDue(4, 4)).toBe(false)
  })
})
