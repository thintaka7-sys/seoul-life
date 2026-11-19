import { describe, expect, it } from 'vitest'
import { pairReading } from '../../learning/furigana/furigana'
import { plainSegments, revealSegments, totalChars } from './typewriter'

const segments = pairReading('커피 주세요.', 'コピ ジュセヨ') ?? []

describe('文字送り', () => {
  it('文字数は区切りの間の空白も数える', () => {
    expect(totalChars(segments)).toBe(2 + 1 + 4)
    expect(totalChars(plainSegments('안녕하세요.'))).toBe(6)
  })

  it('途中まで見せるとき、見えていない部分は場所だけ取り、フリガナは区切りを表示し終えてから出す', () => {
    expect(revealSegments(segments, 1)).toEqual([
      { shown: '커', hidden: '피', complete: false, ruby: 'コピ', spaceShown: true },
      { shown: '', hidden: '주세요.', complete: false, ruby: 'ジュセヨ', spaceShown: false },
    ])
    const r = revealSegments(segments, 4)
    expect(r[0]).toMatchObject({ shown: '커피', complete: true })
    expect(r[1]).toMatchObject({ shown: '주', hidden: '세요.', complete: false, spaceShown: true })
  })

  it('0文字・全文・全文より多いときも崩れない', () => {
    expect(revealSegments(segments, 0).every((s) => s.shown === '' && !s.complete)).toBe(true)
    expect(revealSegments(segments, 7).every((s) => s.complete && s.hidden === '')).toBe(true)
    expect(revealSegments(segments, 100).every((s) => s.complete)).toBe(true)
    expect(revealSegments(segments, -3)[0]?.shown).toBe('')
  })
})
