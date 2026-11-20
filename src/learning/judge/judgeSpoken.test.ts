import { describe, expect, it } from 'vitest'
import { judgeSpoken, numeralVariant, stripFillers, unifySameSoundVowels } from './judgeSpoken'

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

describe('話す答えの判定のゆるめ方（BUG-004、Q1 の A）', () => {
  it('同じ音として発音される母音を1つにそろえる（ㅐ＝ㅔ、ㅒ＝ㅖ、ㅙ＝ㅚ＝ㅞ）', () => {
    expect(unifySameSoundVowels('내')).toBe('네')
    expect(unifySameSoundVowels('얘기')).toBe('예기')
    expect(unifySameSoundVowels('됐어요')).toBe(unifySameSoundVowels('됬어요'))
    expect(unifySameSoundVowels('왜')).toBe(unifySameSoundVowels('웨'))
    expect(unifySameSoundVowels('감사합니다.')).toBe('감사합니다.')
  })

  it('同じ音のつづり違いは正解にし、データに書かれた正解の形を返す', () => {
    expect(judgeSpoken(['내'], ['네.'])).toEqual({ kind: 'correct', matched: '네.', heard: '내' })
    expect(judgeSpoken(['반가와요'], ['반가워요.'])).toMatchObject({ kind: 'incorrect' })
    expect(judgeSpoken(['괜찬아요'], ['괜찮아요.'])).toMatchObject({ kind: 'incorrect' })
  })

  it('文の頭・終わりのつなぎの声（음・어・으）は無視する', () => {
    expect(stripFillers('음 안녕하세요')).toBe('안녕하세요')
    expect(stripFillers('어... 감사합니다 음')).toBe('감사합니다')
    expect(stripFillers('음')).toBe('음')
    expect(stripFillers('어디예요')).toBe('어디예요')
    expect(judgeSpoken(['음 아메리카노 한 잔 주세요'], ['아메리카노 한 잔 주세요.'])).toMatchObject({ kind: 'correct', heard: '음 아메리카노 한 잔 주세요' })
  })

  it('文の途中のつなぎの声や、意味の違う1字違いは通さない', () => {
    expect(judgeSpoken(['아메리카노 음 한 잔 주세요'], ['아메리카노 한 잔 주세요.'])).toMatchObject({ kind: 'incorrect' })
    expect(judgeSpoken(['안녕히 가세요'], ['안녕히 계세요.'])).toMatchObject({ kind: 'incorrect' })
    expect(judgeSpoken(['안녕히 계세요'], ['안녕히 가세요.'])).toMatchObject({ kind: 'incorrect' })
  })
})
