import { describe, expect, it } from 'vitest'
import { diffAnswer, diffDigits, diffText, type DiffPart } from './diff'

const marked = (parts: DiffPart[]) => parts.map((p) => (p.diff ? `[${p.text}]` : p.text)).join('')

describe('diffText（違う文字を求める）', () => {
  it('同じ文は違いなし', () => {
    const d = diffText('커피 주세요', '커피 주세요')
    expect(d.distance).toBe(0)
    expect(marked(d.given)).toBe('커피 주세요')
  })

  it('違う音節を、両方の文で目立たせる', () => {
    const d = diffText('코피 주세요', '커피 주세요')
    expect(marked(d.given)).toBe('[코]피 주세요')
    expect(marked(d.expected)).toBe('[커]피 주세요')
    expect(d.distance).toBe(2)
  })

  it('足りない文字は正解の側に、余分な文字は自分の答えの側に印を付ける', () => {
    expect(marked(diffText('감사니다', '감사합니다').expected)).toBe('감사[합]니다')
    expect(marked(diffText('감사합니다요', '감사합니다').given)).toBe('감사합니다[요]')
  })

  it('空白の違い（分かち書き）にも印を付ける', () => {
    const d = diffText('커피주세요', '커피 주세요')
    expect(marked(d.given)).toBe('커피주세요')
    expect(marked(d.expected)).toBe('커피[ ]주세요')
  })

  it('空の答えは、正解がすべて違う文字になる', () => {
    expect(marked(diffText('', '네').expected)).toBe('[네]')
  })
})

describe('diffAnswer（正解が複数あるとき）', () => {
  it('判定と同じように整えてから比べる（句読点・前後の空白・全角）', () => {
    const d = diffAnswer('  커피　주세요！ ', ['커피 주세요.'])
    expect(d?.distance).toBe(0)
  })

  it('いちばん近い正解と比べ、比べた正解を返す', () => {
    const d = diffAnswer('한 개요', ['하나', '한 개'])
    expect(d?.target).toBe('한 개')
    expect(marked(d?.given ?? [])).toBe('한 개[요]')
  })

  it('正解がなければ null', () => {
    expect(diffAnswer('네', [])).toBeNull()
  })
})

describe('diffDigits（数字の答え）', () => {
  it('カンマ・単位・全角を整えてから比べる', () => {
    expect(diffDigits('３,５００ウォン', '3500').distance).toBe(0)
    expect(marked(diffDigits('3600', '3500').given)).toBe('3[6]00')
  })

  it('時刻は : で比べる', () => {
    expect(marked(diffDigits('3時20分', '3:30').expected)).toBe('3:[3]0')
  })
})
