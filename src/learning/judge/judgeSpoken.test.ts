import { describe, expect, it } from 'vitest'
import { judgeSpoken, numeralVariant } from './judgeSpoken'

describe('numeralVariant', () => {
  it('数える単位の前の数の言葉を数字にする', () => {
    expect(numeralVariant('아메리카노 한 잔 주세요.')).toBe('아메리카노 1 잔 주세요.')
    expect(numeralVariant('케이크 두 개 주세요')).toBe('케이크 2 개 주세요')
    expect(numeralVariant('네, 케이크 한 개 주세요.')).toBe('네, 케이크 1 개 주세요.')
  })

  it('単独の数（하나・둘）も数字にする', () => {
    expect(numeralVariant('아메리카노 하나 주세요.')).toBe('아메리카노 1 주세요.')
  })

  it('「네（はい）」や、数の言葉のない文はそのまま（null）', () => {
    expect(numeralVariant('네.')).toBeNull()
    expect(numeralVariant('네, 맞아요.')).toBeNull()
    expect(numeralVariant('안녕하세요.')).toBeNull()
  })
})

describe('judgeSpoken', () => {
  const answers = ['아메리카노 한 잔 주세요.', '아메리카노 하나 주세요.']

  it('候補のどれかが正解なら通じた（最初の候補が違っても）', () => {
    expect(judgeSpoken(['아메리카 노 한잔 줘요', '아메리카노 한 잔 주세요'], answers)).toEqual({ kind: 'correct', matched: '아메리카노 한 잔 주세요.', heard: '아메리카노 한 잔 주세요' })
  })

  it('分かち書きの違いは、注意なしで正解にする', () => {
    expect(judgeSpoken(['아메리카노 한잔 주세요'], answers)).toMatchObject({ kind: 'correct', matched: '아메리카노 한 잔 주세요.' })
  })

  it('数が数字で認識されても正解にし、元の正解の形を返す', () => {
    expect(judgeSpoken(['아메리카노 1잔 주세요'], answers)).toMatchObject({ kind: 'correct', matched: '아메리카노 한 잔 주세요.' })
    expect(judgeSpoken(['아메리카노 1 주세요'], answers)).toMatchObject({ kind: 'correct', matched: '아메리카노 하나 주세요.' })
  })

  it('通じなかったときは、最初の候補を聞き取った言葉として返す', () => {
    expect(judgeSpoken(['라떼 주세요', '나떼 주세요'], answers)).toEqual({ kind: 'incorrect', heard: '라떼 주세요' })
    expect(judgeSpoken([], answers)).toEqual({ kind: 'incorrect', heard: '' })
  })

  it('「네」の答えは、数字の「4」では正解にならない', () => {
    expect(judgeSpoken(['4'], ['네.', '예.'])).toMatchObject({ kind: 'incorrect' })
    expect(judgeSpoken(['네'], ['네.', '예.'])).toMatchObject({ kind: 'correct', matched: '네.' })
  })
})
