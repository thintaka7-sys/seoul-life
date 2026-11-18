import { describe, expect, it } from 'vitest'
import { furiganaDisplay, pairReading } from './furigana'

describe('pairReading', () => {
  it('区切りごとに読みを組にする（句読点は前の語に付いたまま）', () => {
    expect(pairReading('아메리카노 한 잔 주세요.', 'アメリカノ ハン ジャン ジュセヨ')).toEqual([
      { base: '아메리카노', ruby: 'アメリカノ' },
      { base: '한', ruby: 'ハン' },
      { base: '잔', ruby: 'ジャン' },
      { base: '주세요.', ruby: 'ジュセヨ' },
    ])
  })

  it('句読点だけの区切りには読みを付けない', () => {
    expect(pairReading('커피 주세요 !', 'コピ ジュセヨ')).toEqual([
      { base: '커피', ruby: 'コピ' },
      { base: '주세요', ruby: 'ジュセヨ' },
      { base: '!', ruby: null },
    ])
  })

  it('1語でも組にできる', () => {
    expect(pairReading('안녕하세요', 'アンニョンハセヨ')).toEqual([{ base: '안녕하세요', ruby: 'アンニョンハセヨ' }])
  })

  it('区切りの数が合わなければ null', () => {
    expect(pairReading('안녕히 가세요', 'アンニョンヒガセヨ')).toBeNull()
    expect(pairReading('안녕하세요', 'アンニョン ハセヨ')).toBeNull()
  })
})

describe('furiganaDisplay', () => {
  it('おすすめ：第3章まではいつも表示、第4章からはタップで表示', () => {
    expect(furiganaDisplay('recommended', 1, 3)).toBe('show')
    expect(furiganaDisplay('recommended', 3, 3)).toBe('show')
    expect(furiganaDisplay('recommended', 4, 3)).toBe('tap')
  })

  it('いつも表示／タップで表示／表示しない は章によらない', () => {
    for (const chapter of [1, 10]) {
      expect(furiganaDisplay('always', chapter, 3)).toBe('show')
      expect(furiganaDisplay('tap', chapter, 3)).toBe('tap')
      expect(furiganaDisplay('off', chapter, 3)).toBe('hide')
    }
  })
})
