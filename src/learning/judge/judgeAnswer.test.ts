import { describe, expect, it } from 'vitest'
import { judgeAnswer, normalizeAnswer } from './judgeAnswer'

const coffee = ['아메리카노 한 잔 주세요.', '아메리카노 하나 주세요.']

describe('normalizeAnswer', () => {
  it('前後と連続する空白をまとめる', () => {
    expect(normalizeAnswer('  커피   주세요  ')).toBe('커피 주세요')
    expect(normalizeAnswer('커피\t주세요\n')).toBe('커피 주세요')
  })

  it('句読点（. , ? ! と 。、）を取り除く', () => {
    expect(normalizeAnswer('네, 감사합니다.')).toBe('네 감사합니다')
    expect(normalizeAnswer('뭐 드릴까요?')).toBe('뭐 드릴까요')
    expect(normalizeAnswer('어서 오세요!')).toBe('어서 오세요')
    expect(normalizeAnswer('네、감사합니다。')).toBe('네 감사합니다')
  })

  it('全角の記号・英数字・空白を半角にする', () => {
    expect(normalizeAnswer('커피　주세요？')).toBe('커피 주세요')
    expect(normalizeAnswer('ＡＢＣ１２３')).toBe('ABC123')
  })

  it('NFC に正規化する（字母に分かれた形でも同じになる）', () => {
    expect(normalizeAnswer('커피'.normalize('NFD'))).toBe('커피')
  })

  it('ハングルの字母（互換字母）はそのまま残す', () => {
    expect(normalizeAnswer('ㄱㄴ')).toBe('ㄱㄴ')
  })
})

describe('judgeAnswer', () => {
  it('完全に一致すれば正解（一致した正解を返す）', () => {
    expect(judgeAnswer('아메리카노 한 잔 주세요.', coffee)).toEqual({ kind: 'correct', matched: '아메리카노 한 잔 주세요.' })
  })

  it('句読点・空白・全角の違いは正解', () => {
    expect(judgeAnswer('아메리카노 한 잔 주세요', coffee).kind).toBe('correct')
    expect(judgeAnswer(' 아메리카노  한 잔 주세요！ ', coffee).kind).toBe('correct')
    expect(judgeAnswer('아메리카노　한　잔　주세요？', coffee).kind).toBe('correct')
  })

  it('別解（2つ目以降の正解）も正解', () => {
    expect(judgeAnswer('아메리카노 하나 주세요', coffee)).toEqual({ kind: 'correct', matched: '아메리카노 하나 주세요.' })
  })

  it('分かち書きだけが違えば「分かち書きに注意」', () => {
    expect(judgeAnswer('아메리카노한잔주세요', coffee)).toEqual({ kind: 'spacing', matched: '아메리카노 한 잔 주세요.' })
    expect(judgeAnswer('아메리카노 한잔 주세요.', coffee)).toEqual({ kind: 'spacing', matched: '아메리카노 한 잔 주세요.' })
    expect(judgeAnswer('안녕히계세요', ['안녕히 계세요.'])).toEqual({ kind: 'spacing', matched: '안녕히 계세요.' })
  })

  it('完全一致する正解があれば、分かち書きの注意より優先する', () => {
    expect(judgeAnswer('ab', ['a b', 'ab']).kind).toBe('correct')
  })

  it('違う言葉・空の入力は不正解', () => {
    expect(judgeAnswer('커피 주세요', coffee)).toEqual({ kind: 'incorrect' })
    expect(judgeAnswer('안녕히 가세요', ['안녕히 계세요.'])).toEqual({ kind: 'incorrect' })
    expect(judgeAnswer('', coffee)).toEqual({ kind: 'incorrect' })
    expect(judgeAnswer(' . ', coffee)).toEqual({ kind: 'incorrect' })
  })

  it('組み立て途中の字母が残っていれば不正解', () => {
    expect(judgeAnswer('감사합니ㄷ', ['감사합니다.'])).toEqual({ kind: 'incorrect' })
  })
})
