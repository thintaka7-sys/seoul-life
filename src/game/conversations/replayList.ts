// 「会話をもう一度」の一覧（BUG-007）。終えたイベントの会話を、もう一度遊べるようにする。
// 遊び直しで答えた問題の往復も、記録・復習・章末テストの条件に数える（Phase 2.5 修正 Q1）。

import type { Conversation, GameEvent } from '../../data/types'
import { isQuestionTurn } from '../../learning/practice/questions'
import { conversationTurnKey, type ConversationRecord } from '../../storage/saveData'

export interface ConversationEntry {
  conversation: Conversation
  /** その会話が出てくるイベント */
  event: GameEvent
  /** イベントの中で何番目の会話か（1から） */
  order: number
  /** 答えた問題の往復の数と、問題の往復の数 */
  answered: number
  total: number
  /** もう一度遊べるか（そのイベントを終えている） */
  playable: boolean
}

/** 答えた（選んで・書いて、どちらかで正解した）問題の往復の数 */
export function answeredTurns(conversation: Conversation, records: Readonly<Record<string, ConversationRecord>>): { answered: number; total: number } {
  let answered = 0
  let total = 0
  conversation.turns.forEach((turn, i) => {
    if (!isQuestionTurn(turn)) return
    total++
    const r = records[conversationTurnKey(conversation.id, i)]
    if (r?.choice === true || r?.write === true) answered++
  })
  return { answered, total }
}

/** イベントの順に、会話を並べる（イベントで使われていない会話は入れない） */
export function conversationEntries(
  events: readonly GameEvent[],
  conversations: readonly Conversation[],
  completedEvents: readonly string[],
  records: Readonly<Record<string, ConversationRecord>>,
): ConversationEntry[] {
  const byId = new Map(conversations.map((c) => [c.id, c]))
  const done = new Set(completedEvents)
  return events.flatMap((event) => {
    let order = 0
    return event.steps.flatMap((step) => {
      if (step.type !== 'conversation') return []
      const conversation = byId.get(step.id)
      if (conversation === undefined) return []
      order++
      return [{ conversation, event, order, ...answeredTurns(conversation, records), playable: done.has(event.id) }]
    })
  })
}

/** もう一度遊べる会話か（終えたイベントの会話） */
export function isReplayable(conversationId: string, events: readonly GameEvent[], completedEvents: readonly string[]): boolean {
  return events.some((e) => completedEvents.includes(e.id) && e.steps.some((s) => s.type === 'conversation' && s.id === conversationId))
}
