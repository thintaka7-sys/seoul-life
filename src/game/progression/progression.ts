// セーブデータの進行・学習記録・経験値を更新する純粋な関数。
// 経験値は「初めてのとき」だけ付ける（同じ問題の繰り返しで無制限に増えないように。GAME_SPEC 7-1）。

import type { Balance, GameEvent } from '../../data/types'
import { conversationTurnKey, type SaveData } from '../../storage/saveData'
import { playableStep, resumeStep } from '../events/events'

export interface Reward {
  xp: number
  /** 新しく図鑑に入った単語の数 */
  newWords: number
}

export interface Updated {
  save: SaveData
  reward: Reward
}

const NO_REWARD: Reward = { xp: 0, newWords: 0 }

function addXp(save: SaveData, xp: number, now: string): SaveData {
  return { ...save, updatedAt: now, stats: { ...save.stats, xp: save.stats.xp + xp } }
}

/**
 * イベントを始める（途中から再開する場合は段階を保つ）。
 * 段階の番号は、画面に出す段階に合わせる（background を飛ばす。データが変わって番号が範囲外なら収める）
 */
export function startEvent(save: SaveData, event: GameEvent, now: string): SaveData {
  const active = save.progress.activeEvent
  const step = resumeStep(event, active?.id === event.id ? active.step : 0)
  if (active?.id === event.id && active.step === step) return save
  return { ...save, updatedAt: now, progress: { ...save.progress, activeEvent: { id: event.id, step } } }
}

/** 単語・文法を覚えた記録を付ける。初めての単語ごとに経験値 */
export function learnItems(
  save: SaveData,
  items: { vocabulary: readonly string[]; grammar: readonly string[] },
  chapter: number,
  balance: Balance,
  now: string,
): Updated {
  const words = { ...save.learning.words }
  const grammar = { ...save.learning.grammar }
  let newWords = 0
  for (const id of items.vocabulary) {
    if (words[id] !== undefined) continue
    words[id] = { learnedAt: now, chapter }
    newWords++
  }
  for (const id of items.grammar) {
    if (grammar[id] === undefined) grammar[id] = { learnedAt: now, chapter }
  }
  const xp = newWords * balance.xp.learnWord
  const next: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, words, grammar } }
  return { save: addXp(next, xp, now), reward: { xp, newWords } }
}

/** 会話をどの方法で終えたか。revealed は「答えを見る」で進んだ場合（経験値なし） */
export type ClearMethod = 'choice' | 'write' | 'revealed'

/** 会話の1往復の正解を記録する。往復ごとに、選んで・書いて、それぞれ初めて正解したときだけ経験値 */
export function clearConversationTurn(save: SaveData, conversationId: string, turn: number, method: ClearMethod, balance: Balance, now: string): Updated {
  if (method === 'revealed') return { save, reward: NO_REWARD }
  const key = conversationTurnKey(conversationId, turn)
  const record = save.learning.conversations[key] ?? { choice: false, write: false }
  if (record[method]) return { save, reward: NO_REWARD }
  const xp = method === 'choice' ? balance.xp.conversationChoice : balance.xp.conversationWrite
  const conversations = { ...save.learning.conversations, [key]: { ...record, [method]: true } }
  const next: SaveData = { ...save, learning: { ...save.learning, conversations } }
  return { save: addXp(next, xp, now), reward: { xp, newWords: 0 } }
}

/**
 * 途中のイベントの段階を1つ進める（background の段階は飛ばす）。最後の段階を終えたら、イベントを完了にして経験値を付ける。
 * 途中のイベントが event でなければ何もしない。
 */
export function advanceEvent(save: SaveData, event: GameEvent, balance: Balance, now: string): Updated & { finished: boolean } {
  const active = save.progress.activeEvent
  if (active?.id !== event.id) return { save, reward: NO_REWARD, finished: false }
  const step = playableStep(event, active.step + 1)
  if (step < event.steps.length) {
    return { save: { ...save, updatedAt: now, progress: { ...save.progress, activeEvent: { id: event.id, step } } }, reward: NO_REWARD, finished: false }
  }
  const alreadyDone = save.progress.completedEvents.includes(event.id)
  const completedEvents = alreadyDone ? save.progress.completedEvents : [...save.progress.completedEvents, event.id]
  const next: SaveData = { ...save, updatedAt: now, progress: { ...save.progress, completedEvents, activeEvent: null } }
  const xp = alreadyDone ? 0 : balance.xp.eventComplete
  return { save: addXp(next, xp, now), reward: { xp, newWords: 0 }, finished: true }
}
