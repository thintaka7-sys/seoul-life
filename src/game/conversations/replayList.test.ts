import { describe, expect, it } from 'vitest'
import type { Conversation, GameEvent } from '../../data/types'
import { answeredTurns, conversationEntries, isReplayable } from './replayList'

const line = { speaker: 'neighbor', korean: '네.', pronunciation: 'ネ', japanese: 'はい。' }
const conv = (id: string, chapter: number): Conversation => ({
  id,
  chapter,
  location: 'home',
  character: 'neighbor',
  reviewed: true,
  turns: [
    { task: 'あいさつ', lines: [line], choices: [{ korean: '네.', pronunciation: 'ネ', japanese: 'はい。', correct: true }] },
    { kind: 'decision', lines: [line], choices: [{ korean: '네.', pronunciation: 'ネ', japanese: 'はい。', correct: false, reply: [line] }] },
    { task: 'お礼', lines: [line], choices: [{ korean: '감사합니다.', pronunciation: 'カムサハムニダ', japanese: 'ありがとう。', correct: true }] },
  ],
})
const ev = (id: string, conversations: string[]): GameEvent => ({
  id,
  chapter: 1,
  location: 'home',
  requires: [],
  objectiveJa: '目標',
  actionJa: `${id}を始める`,
  steps: [{ type: 'message', textJa: 'a' }, ...conversations.map((c) => ({ type: 'conversation' as const, id: c }))],
})

describe('会話をもう一度の一覧', () => {
  const conversations = [conv('home_005', 1), conv('home_006', 1), conv('home_099', 1)]
  const events = [ev('event_001', ['home_005', 'home_006']), ev('event_002', ['home_099'])]

  it('問題の往復だけ数える（選択の往復は数えない）', () => {
    expect(answeredTurns(conversations[0] as Conversation, { 'home_005#0': { choice: true, write: false }, 'home_005#1': { choice: true, write: false } })).toEqual({ answered: 1, total: 2 })
  })

  it('イベントの順に並べ、イベントの中の何番目かと、遊べるか（終えたイベント）を付ける', () => {
    const entries = conversationEntries(events, conversations, ['event_001'], {})
    expect(entries.map((e) => [e.conversation.id, e.event.id, e.order, e.playable])).toEqual([
      ['home_005', 'event_001', 1, true],
      ['home_006', 'event_001', 2, true],
      ['home_099', 'event_002', 1, false],
    ])
    expect(isReplayable('home_006', events, ['event_001'])).toBe(true)
    expect(isReplayable('home_099', events, ['event_001'])).toBe(false)
  })
})
