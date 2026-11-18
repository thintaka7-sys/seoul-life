import { describe, expect, it } from 'vitest'
import { KEY_ROWS, SHIFTED, backspace, keyLabel, typeJamo, typeSpace } from './keyboard'

function typeAll(jamos: string): string {
  let text = ''
  for (const j of jamos) text = j === ' ' ? typeSpace(text) : typeJamo(text, j)
  return text
}

describe('字母の組み立て（es-hangul の動きの確認を含む）', () => {
  it('ㅋ＋ㅓ＋ㅍ＋ㅣ → 커피（QA_GUIDE の例）', () => {
    expect(typeAll('ㅋㅓㅍㅣ')).toBe('커피')
  })

  it('パッチムは次に母音が来たら次の音節へ移る（가＋ㅇ → 강、강＋ㅏ → 가아）', () => {
    expect(typeJamo('가', 'ㅇ')).toBe('강')
    expect(typeJamo('강', 'ㅏ')).toBe('가아')
    expect(typeAll('ㅇㅏㄴㄴㅕㅇㅎㅏㅅㅔㅇㅛ')).toBe('안녕하세요')
  })

  it('二重パッチムを組み立て、母音が来たら後ろの子音だけ移る', () => {
    expect(typeAll('ㄷㅏㄹㄱ')).toBe('닭')
    expect(typeAll('ㄷㅏㄹㄱㅏ')).toBe('달가')
    expect(typeAll('ㅇㅣㅆㅅㅡㅂㄴㅣㄷㅏ')).toBe('있습니다')
  })

  it('二重母音を組み立てる（ㅗ＋ㅏ → ㅘ、ㅜ＋ㅓ → ㅝ）', () => {
    expect(typeAll('ㅇㅗㅏ')).toBe('와')
    expect(typeAll('ㅁㅜㅓ')).toBe('뭐')
    expect(typeAll('ㅇㅗㅐ')).toBe('왜')
  })

  it('濃音で始まる語', () => {
    expect(typeAll('ㅃㅏㅇ')).toBe('빵')
  })

  it('空白をはさんだ文を組み立てる', () => {
    expect(typeAll('ㅋㅓㅍㅣ ㅈㅜㅅㅔㅇㅛ')).toBe('커피 주세요')
    expect(typeAll('ㅇㅏㅁㅔㄹㅣㅋㅏㄴㅗ ㅎㅏㄴ ㅈㅏㄴ ㅈㅜㅅㅔㅇㅛ')).toBe('아메리카노 한 잔 주세요')
  })

  it('空白の後の字母は前の語とつながらない', () => {
    expect(typeAll('ㅎㅏㄴ ㅏ')).toBe('한 ㅏ')
  })
})

describe('1字母ずつ消す', () => {
  it('最後の字母だけを消す', () => {
    expect(backspace('강')).toBe('가')
    expect(backspace('가')).toBe('ㄱ')
    expect(backspace('ㄱ')).toBe('')
    expect(backspace('닭')).toBe('달')
    expect(backspace('뭐')).toBe('무')
    expect(backspace('커피')).toBe('커ㅍ')
  })

  it('末尾の空白を消す・空なら何もしない', () => {
    expect(backspace('커피 ')).toBe('커피')
    expect(backspace('')).toBe('')
  })

  it('消した後に続けて入力できる', () => {
    expect(typeJamo(backspace('강'), 'ㄴ')).toBe('간')
  })
})

describe('空白', () => {
  it('先頭や連続では入れない', () => {
    expect(typeSpace('')).toBe('')
    expect(typeSpace('커피 ')).toBe('커피 ')
    expect(typeSpace('커피')).toBe('커피 ')
  })
})

describe('配列', () => {
  it('2ボル式の3段（10・9・7キー）で、母音・子音が重複しない', () => {
    expect(KEY_ROWS.map((r) => r.length)).toEqual([10, 9, 7])
    const all = KEY_ROWS.flat()
    expect(new Set(all).size).toBe(all.length)
  })

  it('Shift で濃音と ㅒ・ㅖ になり、ほかはそのまま', () => {
    expect(Object.values(SHIFTED)).toEqual(['ㅃ', 'ㅉ', 'ㄸ', 'ㄲ', 'ㅆ', 'ㅒ', 'ㅖ'])
    expect(keyLabel('ㅂ', true)).toBe('ㅃ')
    expect(keyLabel('ㅏ', true)).toBe('ㅏ')
    expect(keyLabel('ㅂ', false)).toBe('ㅂ')
  })
})
