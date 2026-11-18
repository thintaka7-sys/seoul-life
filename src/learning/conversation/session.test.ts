import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../data/types'
import { availableModes, canReveal, createSessionReducer, initialSession, isAnswering, type SessionAction, type ConversationSession } from './session'

const conv: Conversation = {
  id: 'cafe_002',
  chapter: 3,
  location: 'cafe',
  character: 'cafe_staff',
  lines: [
    { speaker: 'cafe_staff', korean: '어서 오세요!', pronunciation: 'オソ オセヨ', japanese: 'いらっしゃいませ！' },
    { speaker: 'cafe_staff', korean: '뭐 드릴까요?', pronunciation: 'ムォ ドゥリルッカヨ', japanese: '何になさいますか？' },
  ],
  choices: [
    { korean: '아메리카노 주세요.', pronunciation: 'アメリカノ ジュセヨ', japanese: 'アメリカーノをください。', correct: true },
    { korean: '안녕히 계세요.', pronunciation: 'アンニョンヒ ゲセヨ', japanese: 'さようなら。', correct: false },
  ],
  freeAnswer: { prompt: 'アメリカーノを1杯ください', answers: ['아메리카노 한 잔 주세요.', '아메리카노 주세요.'] },
  reviewed: true,
}

const reducer = createSessionReducer(conv, 2)
const play = (...actions: SessionAction[]): ConversationSession => actions.reduce(reducer, initialSession())

describe('会話の進み方', () => {
  it('台詞を1つずつ見せ、すべて見せてから返事ができる', () => {
    let s = initialSession()
    expect(s.shownLines).toBe(1)
    expect(isAnswering(conv, s)).toBe(false)
    expect(reducer(s, { type: 'choose', index: 0 })).toBe(s)
    s = reducer(s, { type: 'nextLine' })
    expect(isAnswering(conv, s)).toBe(true)
    expect(reducer(s, { type: 'nextLine' })).toBe(s)
  })

  it('書く問題がない会話では「選ぶ」だけ', () => {
    const { freeAnswer: _omit, ...withoutFree } = conv
    expect(availableModes(withoutFree)).toEqual(['choice'])
    expect(availableModes(conv)).toEqual(['choice', 'write'])
    const r = createSessionReducer(withoutFree, 2)
    expect(r(initialSession(), { type: 'setMode', mode: 'write' }).mode).toBe('choice')
  })
})

describe('選ぶ', () => {
  it('間違えた選択肢は記録し、もう一度選べる', () => {
    const s = play({ type: 'nextLine' }, { type: 'choose', index: 1 })
    expect(s.wrongChoices).toEqual([1])
    expect(s.result).toBeNull()
  })

  it('正解を選ぶと、その選択肢を主人公の返事にする', () => {
    const s = play({ type: 'nextLine' }, { type: 'choose', index: 1 }, { type: 'choose', index: 0 })
    expect(s.result).toEqual({
      method: 'choice',
      line: { korean: '아메리카노 주세요.', pronunciation: 'アメリカノ ジュセヨ', japanese: 'アメリカーノをください。' },
      spacingNote: false,
    })
  })
})

describe('書く', () => {
  it('正解なら、一致した正解を返事にする（同じ文の選択肢があれば読みも付ける）', () => {
    const s = play({ type: 'nextLine' }, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '아메리카노 주세요' })
    expect(s.result).toMatchObject({ method: 'write', line: { korean: '아메리카노 주세요.', pronunciation: 'アメリカノ ジュセヨ' }, spacingNote: false })
  })

  it('同じ文の選択肢がない正解は、読みなし', () => {
    const s = play({ type: 'nextLine' }, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '아메리카노 한 잔 주세요' })
    expect(s.result?.line).toEqual({ korean: '아메리카노 한 잔 주세요.', pronunciation: null, japanese: 'アメリカーノを1杯ください' })
  })

  it('分かち書きだけが違えば、正解にして注意を付ける', () => {
    const s = play({ type: 'nextLine' }, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '아메리카노한잔주세요' })
    expect(s.result).toMatchObject({ method: 'write', spacingNote: true, line: { korean: '아메리카노 한 잔 주세요.' } })
  })

  it('間違えた回数を数え、決めた回数で「答えを見る」を出せる', () => {
    let s = play({ type: 'nextLine' }, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '커피' })
    expect(s.writeMisses).toBe(1)
    expect(s.lastJudge).toEqual({ kind: 'incorrect' })
    expect(canReveal(s, 2)).toBe(false)
    expect(reducer(s, { type: 'reveal' })).toBe(s)
    s = reducer(s, { type: 'submitWrite', text: '커피 주세요' })
    expect(canReveal(s, 2)).toBe(true)
    s = reducer(s, { type: 'reveal' })
    expect(s.result).toMatchObject({ method: 'revealed', line: { korean: '아메리카노 한 잔 주세요.' } })
  })

  it('結果が出た後は、方法の切り替えも答えも受け付けない', () => {
    const s = play({ type: 'nextLine' }, { type: 'choose', index: 0 })
    expect(reducer(s, { type: 'setMode', mode: 'write' })).toBe(s)
    expect(reducer(s, { type: 'choose', index: 1 })).toBe(s)
  })
})
