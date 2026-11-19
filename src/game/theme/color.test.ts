import { describe, expect, it } from 'vitest'
import { DARK_TEXT, LIGHT_TEXT, contrastRatio, readableTextOn, relativeLuminance } from './color'

describe('テーマカラーと文字の色', () => {
  it('相対輝度とコントラスト比（白と黒は21）', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1)
    expect(relativeLuminance('#000000')).toBe(0)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21)
  })

  it('暗い背景には白、明るい背景には濃い色の文字', () => {
    expect(readableTextOn('#1F3A5F')).toBe(LIGHT_TEXT)
    expect(readableTextOn('#F2A07B')).toBe(DARK_TEXT)
    expect(readableTextOn('#B9783F')).toBe(DARK_TEXT)
  })
})
