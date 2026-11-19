import { describe, expect, it } from 'vitest'
import { FINAL_CONSONANTS, INITIAL_CONSONANTS, VOWELS, containsIsolatedJamo, splitSyllable, syllablesOf, unlearnedJamo } from './jamo'

describe('splitSyllable', () => {
  it('パッチムのない音節を分ける', () => {
    expect(splitSyllable('가')).toEqual({ initial: 'ㄱ', medial: 'ㅏ', final: null })
    expect(splitSyllable('아')).toEqual({ initial: 'ㅇ', medial: 'ㅏ', final: null })
  })

  it('複合母音は分けずに1つの母音として返す', () => {
    expect(splitSyllable('와')).toEqual({ initial: 'ㅇ', medial: 'ㅘ', final: null })
    expect(splitSyllable('의')).toEqual({ initial: 'ㅇ', medial: 'ㅢ', final: null })
  })

  it('パッチム（二重パッチムを含む）を分ける', () => {
    expect(splitSyllable('박')).toEqual({ initial: 'ㅂ', medial: 'ㅏ', final: 'ㄱ' })
    expect(splitSyllable('없')).toEqual({ initial: 'ㅇ', medial: 'ㅓ', final: 'ㅄ' })
    expect(splitSyllable('힣')).toEqual({ initial: 'ㅎ', medial: 'ㅣ', final: 'ㅎ' })
    expect(splitSyllable('깎')).toEqual({ initial: 'ㄲ', medial: 'ㅏ', final: 'ㄲ' })
  })

  it('音節でない文字は null', () => {
    expect(splitSyllable('ㄱ')).toBeNull()
    expect(splitSyllable('a')).toBeNull()
    expect(splitSyllable('가나')).toBeNull()
    expect(splitSyllable('')).toBeNull()
  })

  it('字母の一覧の数が正しい', () => {
    expect(INITIAL_CONSONANTS).toHaveLength(19)
    expect(VOWELS).toHaveLength(21)
    expect(FINAL_CONSONANTS).toHaveLength(27)
  })
})

describe('syllablesOf', () => {
  it('空白・句読点を飛ばして音節だけを返す', () => {
    expect(syllablesOf('커피 주세요.').map((s) => s.initial)).toEqual(['ㅋ', 'ㅍ', 'ㅈ', 'ㅅ', 'ㅇ'])
  })
})

describe('containsIsolatedJamo', () => {
  it('互換字母・結合用字母の単体を見つける', () => {
    expect(containsIsolatedJamo('ㄱ')).toBe(true)
    expect(containsIsolatedJamo('가ㅏ')).toBe(true)
    expect(containsIsolatedJamo('가')).toBe(true)
    expect(containsIsolatedJamo('가나다')).toBe(false)
    expect(containsIsolatedJamo('アイ')).toBe(false)
  })
})

describe('unlearnedJamo', () => {
  const vowelsOnly = { letters: new Set(['ㅏ', 'ㅗ', 'ㅜ', 'ㅣ']), finals: new Set<string>() }

  it('文頭の ㅇ は習っていなくても使える', () => {
    expect(unlearnedJamo('아이', vowelsOnly)).toEqual({ letters: [], finals: [] })
  })

  it('習っていない字母を出てきた順に重複なしで返す', () => {
    expect(unlearnedJamo('우유 나무 누나', vowelsOnly)).toEqual({ letters: ['ㅠ', 'ㄴ', 'ㅁ'], finals: [] })
  })

  it('パッチムは、パッチムとして習ったものだけ使える（ㅇ のパッチムも同じ）', () => {
    const known = { letters: new Set(['ㅏ', 'ㅜ', 'ㅅ', 'ㅂ']), finals: new Set(['ㄱ']) }
    expect(unlearnedJamo('수박', known)).toEqual({ letters: [], finals: [] })
    expect(unlearnedJamo('수박 방', known)).toEqual({ letters: [], finals: ['ㅇ'] })
  })
})
