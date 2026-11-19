import { describe, expect, it } from 'vitest'
import { SFX_NAMES, SFX_RECIPES, playSfx, recipeLength } from './sfx'

describe('効果音の作り方', () => {
  it('どの効果音も短く（1秒まで）、小さめの音（0.2まで）にしている', () => {
    for (const name of SFX_NAMES) {
      const notes = SFX_RECIPES[name]
      expect(notes.length, name).toBeGreaterThan(0)
      expect(recipeLength(notes), name).toBeLessThanOrEqual(1)
      for (const n of notes) {
        expect(n.gain, name).toBeGreaterThan(0)
        expect(n.gain, name).toBeLessThanOrEqual(0.2)
        expect(n.freq, name).toBeGreaterThanOrEqual(100)
        expect(n.freq, name).toBeLessThanOrEqual(4000)
      }
    }
  })

  it('音を出せない環境（準備前）でも、鳴らそうとして止まらない', () => {
    expect(() => playSfx('correct')).not.toThrow()
  })
})
