import { describe, expect, it } from 'vitest'
import type { Conversation, ConversationLine, ConversationTurn } from '../../data/types'
import {
  availableModes,
  canReveal,
  characterExpression,
  createSessionReducer,
  initialSession,
  isAnswering,
  sessionPhase,
  shownLines,
  type ConversationSession,
  type SessionAction,
} from './session'

const staff = (korean: string, extra: Partial<ConversationLine> = {}): ConversationLine => ({ speaker: 'cafe_staff', korean, pronunciation: 'ア', japanese: korean, ...extra })

/** 1往復の会話（Phase 1 の会話と同じ形） */
const single: Conversation = {
  id: 'cafe_002',
  chapter: 3,
  location: 'cafe',
  character: 'cafe_staff',
  turns: [
    {
      lines: [
        { speaker: 'cafe_staff', korean: '어서 오세요!', pronunciation: 'オソ オセヨ', japanese: 'いらっしゃいませ！' },
        { speaker: 'cafe_staff', korean: '뭐 드릴까요?', pronunciation: 'ムォ ドゥリルッカヨ', japanese: '何になさいますか？' },
      ],
      choices: [
        { korean: '아메리카노 주세요.', pronunciation: 'アメリカノ ジュセヨ', japanese: 'アメリカーノをください。', correct: true },
        { korean: '안녕히 계세요.', pronunciation: 'アンニョンヒ ゲセヨ', japanese: 'さようなら。', correct: false },
      ],
      freeAnswer: { prompt: 'アメリカーノを1杯ください', answers: ['아메리카노 한 잔 주세요.', '아메리카노 주세요.'] },
    },
  ],
  reviewed: true,
}

/** 3往復の会話：反応つきの質問 → lines のない質問 → 締めの台詞 */
const multi: Conversation = {
  ...single,
  id: 'cafe_010',
  turns: [
    {
      lines: [staff('뭐 드릴까요?')],
      choices: [
        { korean: '아메리카노 주세요.', pronunciation: 'アメリカノ ジュセヨ', japanese: 'アメリカーノ', correct: true, reply: [staff('아이스로 드릴까요?')] },
        { korean: '녹차 주세요.', pronunciation: 'ノクチャ ジュセヨ', japanese: '緑茶', correct: true, reply: [staff('녹차요?', { expression: 'troubled' }), staff('네, 알겠습니다.')] },
        { korean: '안녕히 계세요.', pronunciation: 'アンニョンヒ ゲセヨ', japanese: 'さようなら', correct: false, reply: [staff('네?')] },
        { korean: '아니요.', pronunciation: 'アニヨ', japanese: 'いいえ', correct: false },
      ],
      freeAnswer: { prompt: 'アメリカーノをください', answers: ['아메리카노 한 잔 주세요.'] },
    },
    {
      lines: [],
      choices: [{ korean: '네.', pronunciation: 'ネ', japanese: 'はい', correct: true }],
      freeAnswer: { prompt: 'はい', answers: ['네.'], reply: [staff('네!', { expression: 'smile' })] },
    },
    { lines: [staff('맛있게 드세요.')] },
  ],
}

function player(conversation: Conversation) {
  const reducer = createSessionReducer(conversation, 2)
  const play = (...actions: SessionAction[]): ConversationSession => actions.reduce(reducer, initialSession(conversation))
  return { reducer, play }
}

const next: SessionAction = { type: 'next' }

describe('1往復の会話', () => {
  const { reducer, play } = player(single)

  it('台詞を1つずつ見せ、すべて見せてから返事ができる', () => {
    let s = initialSession(single)
    expect(s.shownLines).toBe(1)
    expect(sessionPhase(single, s)).toBe('lines')
    expect(reducer(s, { type: 'choose', index: 0 })).toBe(s)
    s = reducer(s, next)
    expect(isAnswering(single, s)).toBe(true)
    expect(reducer(s, next)).toBe(s)
  })

  it('書く問題がない往復では「選ぶ」だけ。返事のない往復では答え方がない', () => {
    const turn = single.turns[0] as ConversationTurn
    const { freeAnswer: _omit, ...withoutFree } = turn
    expect(availableModes(withoutFree)).toEqual(['choice'])
    expect(availableModes(turn)).toEqual(['choice', 'write'])
    expect(availableModes({ lines: [staff('a')] })).toEqual([])
    const r = createSessionReducer({ ...single, turns: [withoutFree] }, 2)
    expect(r(r(initialSession(single), next), { type: 'setMode', mode: 'write' }).mode).toBe('choice')
  })

  it('間違えた選択肢は記録し、もう一度選べる', () => {
    const s = play(next, { type: 'choose', index: 1 })
    expect(s.wrongChoices).toEqual([1])
    expect(s.answer).toBeNull()
  })

  it('正解を選ぶと、その選択肢を主人公の返事にし、反応がなければ会話の最後になる', () => {
    const s = play(next, { type: 'choose', index: 1 }, { type: 'choose', index: 0 })
    expect(s.answer).toEqual({
      method: 'choice',
      line: { korean: '아메리카노 주세요.', pronunciation: 'アメリカノ ジュセヨ', japanese: 'アメリカーノをください。' },
      spacingNote: false,
      reply: [],
    })
    expect(sessionPhase(single, s)).toBe('end')
    expect(reducer(s, next)).toBe(s)
  })

  it('書いて正解なら、一致した正解を返事にする（同じ文の選択肢があれば読みも付ける）', () => {
    const s = play(next, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '아메리카노 주세요' })
    expect(s.answer).toMatchObject({ method: 'write', line: { korean: '아메리카노 주세요.', pronunciation: 'アメリカノ ジュセヨ' }, spacingNote: false })
  })

  it('同じ文の選択肢がない正解は、読みなし', () => {
    const s = play(next, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '아메리카노 한 잔 주세요' })
    expect(s.answer?.line).toEqual({ korean: '아메리카노 한 잔 주세요.', pronunciation: null, japanese: 'アメリカーノを1杯ください' })
  })

  it('分かち書きだけが違えば、正解にして注意を付ける', () => {
    const s = play(next, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '아메리카노한잔주세요' })
    expect(s.answer).toMatchObject({ method: 'write', spacingNote: true, line: { korean: '아메리카노 한 잔 주세요.' } })
  })

  it('間違えた回数を数え、決めた回数で「答えを見る」を出せる', () => {
    let s = play(next, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '커피' })
    expect(s.writeMisses).toBe(1)
    expect(s.lastJudge).toEqual({ kind: 'incorrect' })
    expect(canReveal(single, s, 2)).toBe(false)
    expect(reducer(s, { type: 'reveal' })).toBe(s)
    s = reducer(s, { type: 'submitWrite', text: '커피 주세요' })
    expect(canReveal(single, s, 2)).toBe(true)
    s = reducer(s, { type: 'reveal' })
    expect(s.answer).toMatchObject({ method: 'revealed', line: { korean: '아메리카노 한 잔 주세요.' } })
  })

  it('答えた後は、方法の切り替えも答えも受け付けない', () => {
    const s = play(next, { type: 'choose', index: 0 })
    expect(reducer(s, { type: 'setMode', mode: 'write' })).toBe(s)
    expect(reducer(s, { type: 'choose', index: 1 })).toBe(s)
  })
})

describe('数往復の会話', () => {
  const { reducer, play } = player(multi)

  it('答え → 反応を1つずつ → 次の往復 → 締めの台詞 → 最後、と進む', () => {
    let s = play({ type: 'choose', index: 1 })
    expect(sessionPhase(multi, s)).toBe('reply')
    expect(s.shownReply).toBe(0)
    s = reducer(s, next)
    expect(s.shownReply).toBe(1)
    s = reducer(s, next)
    expect(s.shownReply).toBe(2)
    s = reducer(s, next)
    // 2往復目は lines がないので、すぐ答える
    expect(s.turn).toBe(1)
    expect(sessionPhase(multi, s)).toBe('answer')
    expect(s.history).toHaveLength(1)
    s = reducer(s, { type: 'choose', index: 0 })
    s = reducer(s, next)
    expect(s.turn).toBe(2)
    expect(sessionPhase(multi, s)).toBe('end')
    expect(shownLines(multi, s).map((l) => `${l.kind}:${l.korean}`)).toEqual([
      'line:뭐 드릴까요?',
      'player:녹차 주세요.',
      'reply:녹차요?',
      'reply:네, 알겠습니다.',
      'player:네.',
      'line:맛있게 드세요.',
    ])
  })

  it('間違えた選択肢の反応を一時的に見せ、次に選び直すと消える', () => {
    let s = play({ type: 'choose', index: 2 })
    expect(shownLines(multi, s).at(-1)).toMatchObject({ kind: 'wrongReply', korean: '네?' })
    s = reducer(s, { type: 'choose', index: 3 })
    expect(s.wrongReply).toBeNull()
    s = reducer(s, { type: 'choose', index: 0 })
    expect(shownLines(multi, s).some((l) => l.kind === 'wrongReply')).toBe(false)
  })

  it('書いた答えの反応は freeAnswer.reply → 同じ文の選択肢の reply → 最初の正解の選択肢の reply の順で選ぶ', () => {
    // 1往復目：freeAnswer.reply がなく、同じ文の選択肢もない → 最初の正解（아메리카노）の反応
    let s = play({ type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '아메리카노 한 잔 주세요.' })
    expect(s.answer?.reply.map((l) => l.korean)).toEqual(['아이스로 드릴까요?'])
    // 2往復目：freeAnswer.reply がある
    s = reducer(reducer(s, next), next)
    expect(s.turn).toBe(1)
    expect(s.mode).toBe('write')
    s = reducer(s, { type: 'submitWrite', text: '네' })
    expect(s.answer?.reply.map((l) => l.korean)).toEqual(['네!'])
  })

  it('往復が変わると、間違いの記録と答えはリセットされる', () => {
    let s = play({ type: 'choose', index: 3 }, { type: 'choose', index: 0 }, next, next)
    expect(s.turn).toBe(1)
    expect(s.wrongChoices).toEqual([])
    expect(s.answer).toBeNull()
    s = reducer(s, { type: 'choose', index: 0 })
    expect(s.answer?.method).toBe('choice')
  })
})

describe('立ち絵の表情', () => {
  const { reducer, play } = player(multi)

  it('ふだんの台詞は normal', () => {
    expect(characterExpression(multi, initialSession(multi))).toBe('normal')
  })

  it('正解した直後は笑顔、反応の台詞も表情の指定がなければ笑顔', () => {
    let s = play({ type: 'choose', index: 0 })
    expect(characterExpression(multi, s)).toBe('smile')
    s = reducer(s, next)
    expect(characterExpression(multi, s)).toBe('smile')
  })

  it('台詞に書かれた表情は、自動の表情より優先する', () => {
    const s = play({ type: 'choose', index: 1 }, next)
    expect(shownLines(multi, s).at(-1)?.korean).toBe('녹차요?')
    expect(characterExpression(multi, s)).toBe('troubled')
    expect(characterExpression(multi, reducer(s, next))).toBe('smile')
  })

  it('間違えると困り顔（反応の台詞があっても、表情の指定がなければ困り顔）', () => {
    expect(characterExpression(multi, play({ type: 'choose', index: 3 }))).toBe('troubled')
    expect(characterExpression(multi, play({ type: 'choose', index: 2 }))).toBe('troubled')
    expect(characterExpression(multi, play({ type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: '커피' }))).toBe('troubled')
  })

  it('次の往復の台詞で元に戻る', () => {
    const s = play({ type: 'choose', index: 0 }, next, next, { type: 'choose', index: 0 }, next)
    expect(shownLines(multi, s).at(-1)?.korean).toBe('맛있게 드세요.')
    expect(characterExpression(multi, s)).toBe('normal')
  })

  it('「答えを見る」で進んだときは笑顔にしない', () => {
    const { reducer: r1, play: p1 } = player(single)
    let s = p1(next, { type: 'setMode', mode: 'write' }, { type: 'submitWrite', text: 'x' }, { type: 'submitWrite', text: 'y' })
    s = r1(s, { type: 'reveal' })
    expect(characterExpression(single, s)).toBe('normal')
  })
})
