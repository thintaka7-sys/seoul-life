import { describe, expect, it } from 'vitest'
import { baseName, pickNewest } from './inputFiles.ts'

describe('baseName', () => {
  it('画像の拡張子だけを外す', () => {
    expect(baseName('bg_home.png')).toBe('bg_home')
    expect(baseName('bg_airport.JPE')).toBe('bg_airport')
    expect(baseName('bg_home')).toBe('bg_home')
    expect(baseName('notes.txt')).toBe('notes.txt')
  })
})

describe('pickNewest', () => {
  it('拡張子が違っても同じ名前なら候補にし、新しいほうを選ぶ', () => {
    const files = [
      { name: 'bg_home.png', mtimeMs: 100 },
      { name: 'bg_home.jpe', mtimeMs: 200 },
      { name: 'bg_cafe.png', mtimeMs: 300 },
    ]
    expect(pickNewest('bg_home.png', files)).toBe('bg_home.jpe')
    expect(pickNewest('bg_cafe.png', files)).toBe('bg_cafe.png')
    expect(pickNewest('bg_cafe.jpg', files)).toBe('bg_cafe.png')
  })

  it('画像でないファイルや、名前の一部だけ同じものは選ばない', () => {
    const files = [
      { name: 'bg_home.txt', mtimeMs: 1 },
      { name: 'bg_home2.png', mtimeMs: 2 },
    ]
    expect(pickNewest('bg_home.png', files)).toBeNull()
  })
})
