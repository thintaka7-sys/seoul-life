// セーブデータの進行・学習記録・経験値を更新する純粋な関数。
// 経験値は「初めてのとき」だけ付ける（同じ問題の繰り返しで無制限に増えないように。GAME_SPEC 7-1）。

import type { Balance, GameEvent, StampActivity } from '../../data/types'
import { localDate } from '../../learning/review/dates'
import { answerScheduled, freshRecord, isDue, recordMistake, reviewKey } from '../../learning/review/review'
import { conversationTurnKey, type ReviewRecord, type SaveData } from '../../storage/saveData'
import { playableStep, resumeStep } from '../events/events'
import { withStamp } from '../stamps/stamps'

export interface Reward {
  xp: number
  /** 新しく図鑑に入った単語の数 */
  newWords: number
  /** 今日のスタンプを押した */
  stamp?: boolean
  /** 新しく行けるようになった施設のID */
  unlocked?: string[]
  /** もらったコイン（Phase 4。GAME_SPEC 7-3） */
  coins?: number
  /** 上がったレベル */
  levelUp?: number
  /** 新しく達成した実績のID */
  achievements?: string[]
  /** 届いたスタンプの節目（日数） */
  milestones?: number[]
}

export interface Updated {
  save: SaveData
  reward: Reward
}

const NO_REWARD: Reward = { xp: 0, newWords: 0 }

function addXp(save: SaveData, xp: number, now: string): SaveData {
  return { ...save, updatedAt: now, stats: { ...save.stats, xp: save.stats.xp + xp } }
}

function addCoins(save: SaveData, coins: number): SaveData {
  return coins === 0 ? save : { ...save, stats: { ...save.stats, coins: save.stats.coins + coins } }
}

function withReview(save: SaveData, review: Record<string, ReviewRecord>): SaveData {
  return { ...save, learning: { ...save.learning, review } }
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

/**
 * 単語・文法を覚えた記録を付ける。初めての単語ごとに経験値。
 * forms は、覚えた単語の形が変わる言葉の問題のキー（form:…）。単語と同じく翌日から復習に出す（GAME_SPEC 4-3）
 */
export function learnItems(
  save: SaveData,
  items: { vocabulary: readonly string[]; grammar: readonly string[]; forms?: readonly string[] },
  chapter: number,
  balance: Balance,
  now: string,
): Updated {
  const words = { ...save.learning.words }
  const grammar = { ...save.learning.grammar }
  const review = { ...save.learning.review }
  const today = localDate(now)
  // 初めて覚えたものは、翌日から復習に出す（計画 Q4）
  const startReview = (key: string) => {
    if (review[key] === undefined) review[key] = freshRecord(today, balance.review)
  }
  let newWords = 0
  for (const id of items.vocabulary) {
    if (words[id] !== undefined) continue
    words[id] = { learnedAt: now, chapter }
    startReview(reviewKey('word', id))
    newWords++
  }
  for (const id of items.grammar) {
    if (grammar[id] !== undefined) continue
    grammar[id] = { learnedAt: now, chapter }
    startReview(reviewKey('grammar', id))
  }
  for (const key of items.forms ?? []) startReview(key)
  const xp = newWords * balance.xp.learnWord
  const next: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, words, grammar, review } }
  return { save: addXp(next, xp, now), reward: { xp, newWords } }
}

/** 会話をどの方法で終えたか。revealed は「答えを見る」で進んだ場合（経験値なし） */
export type ClearMethod = 'choice' | 'write' | 'revealed'

/**
 * 会話の1往復（問題の往復）の正解を記録する。往復ごとに、選んで・書いて、それぞれ初めて正解したときだけ経験値。
 * 正解した往復は翌日から復習に出す。「答えを見る」で進んだ往復は、経験値を付けず「間違えた」として復習に入れる（計画 Q4）
 */
export function clearConversationTurn(save: SaveData, conversationId: string, turn: number, method: ClearMethod, balance: Balance, now: string): Updated {
  const key = conversationTurnKey(conversationId, turn)
  const rKey = reviewKey('turn', key)
  const today = localDate(now)
  const currentReview = save.learning.review[rKey]
  if (method === 'revealed') {
    const review = { ...save.learning.review, [rKey]: recordMistake(currentReview, today, balance.review) }
    return { save: { ...withReview(save, review), updatedAt: now }, reward: NO_REWARD }
  }
  const withTurnReview = currentReview === undefined ? withReview(save, { ...save.learning.review, [rKey]: freshRecord(today, balance.review) }) : save
  const record = save.learning.conversations[key] ?? { choice: false, write: false }
  if (record[method]) return { save: withTurnReview === save ? save : { ...withTurnReview, updatedAt: now }, reward: NO_REWARD }
  const xp = method === 'choice' ? balance.xp.conversationChoice : balance.xp.conversationWrite
  const conversations = { ...save.learning.conversations, [key]: { ...record, [method]: true } }
  const next: SaveData = { ...withTurnReview, learning: { ...withTurnReview.learning, conversations } }
  return { save: addXp(next, xp, now), reward: { xp, newWords: 0 } }
}

/** 復習の問題に答えた場面。review：今日の復習、practice：自分から選んだ練習・ドリル・テスト */
export type ReviewSource = 'review' | 'practice'

/**
 * 復習の問題に答えた記録を付ける。
 * - 今日の復習で、期限の来た問題：正解なら間隔を延ばして経験値、間違いなら最初の間隔に戻す
 * - それ以外（練習・ドリル・テスト、期限の来ていない問題）：間違えたときだけ、翌日の復習に戻す（経験値なし。計画 Q13）
 */
export function answerReview(save: SaveData, key: string, correct: boolean, source: ReviewSource, balance: Balance, now: string): Updated {
  const today = localDate(now)
  // 形が変わる言葉の問題は、初めて正解した記録を付ける（経験値は復習の分だけ）
  const formId = correct && key.startsWith('form:') ? key.slice('form:'.length) : null
  if (formId !== null && save.learning.forms[formId] === undefined) {
    const recorded: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, forms: { ...save.learning.forms, [formId]: { correctAt: now } } } }
    return answerReview(recorded, key, correct, source, balance, now)
  }
  const record = save.learning.review[key]
  if (source === 'review' && record !== undefined && isDue(record, today)) {
    const next = { ...withReview(save, { ...save.learning.review, [key]: answerScheduled(record, correct, today, now, balance.review) }), updatedAt: now }
    if (!correct) return { save: next, reward: NO_REWARD }
    return { save: addXp(next, balance.xp.review, now), reward: { xp: balance.xp.review, newWords: 0 } }
  }
  if (correct) return { save, reward: NO_REWARD }
  return { save: { ...withReview(save, { ...save.learning.review, [key]: recordMistake(record, today, balance.review) }), updatedAt: now }, reward: NO_REWARD }
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
  // コイン：初めて終えたイベントごとに。章の終わりの段階があるイベント（章を終えた）は、さらに足す
  const coins = alreadyDone ? 0 : balance.coins.eventComplete + (event.steps.some((s) => s.type === 'chapterEnd') ? balance.coins.chapterClear : 0)
  return { save: addCoins(addXp(next, xp, now), coins), reward: { xp, newWords: 0, ...(coins > 0 ? { coins } : {}) }, finished: true }
}

/**
 * ハングルのレッスンの小テストに合格した記録を付ける。初めて合格したときだけ経験値。
 * 2回目以降は、点が上がったときだけ「いちばん良い点」を更新する。
 */
export function passHangulLesson(save: SaveData, lessonId: string, score: number, balance: Balance, now: string): Updated {
  const prev = save.learning.hangul[lessonId]
  if (prev !== undefined && score <= prev.bestScore) return { save, reward: NO_REWARD }
  const record = prev === undefined ? { passedAt: now, bestScore: score } : { ...prev, bestScore: score }
  const next: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, hangul: { ...save.learning.hangul, [lessonId]: record } } }
  const xp = prev === undefined ? balance.xp.hangulLesson : 0
  return { save: addXp(next, xp, now), reward: { xp, newWords: 0 } }
}

/** リスニングの問題に正解した記録を付ける。問題ごとに、初めて正解したときだけ経験値 */
export function recordListeningCorrect(save: SaveData, key: string, balance: Balance, now: string): Updated {
  if (save.learning.listening[key] !== undefined) return { save, reward: NO_REWARD }
  const next: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, listening: { ...save.learning.listening, [key]: { correctAt: now } } } }
  return { save: addXp(next, balance.xp.listening, now), reward: { xp: balance.xp.listening, newWords: 0 } }
}

/**
 * 基礎ドリル（章末テストの追加の問題も同じ）の問題に答えた記録を付ける。
 * 初めて正解したときだけ経験値。間違えたら翌日の復習に入れる（計画 Q4）
 */
export function answerDrillItem(save: SaveData, itemId: string, correct: boolean, balance: Balance, now: string): Updated {
  if (!correct) return answerReview(save, reviewKey('drill', itemId), false, 'practice', balance, now)
  if (save.learning.drills[itemId] !== undefined) return { save, reward: NO_REWARD }
  const next: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, drills: { ...save.learning.drills, [itemId]: { correctAt: now } } } }
  return { save: addXp(next, balance.xp.drillItem, now), reward: { xp: balance.xp.drillItem, newWords: 0 } }
}

/** 章末テストを終えた記録を付ける（いちばん良い点と、初めて合格した日時）。初めて合格したときだけ経験値 */
export function finishChapterTest(save: SaveData, testId: string, score: number, passed: boolean, balance: Balance, now: string): Updated {
  const prev = save.learning.tests[testId]
  const firstPass = passed && (prev?.passedAt ?? null) === null
  const record = { passedAt: prev?.passedAt ?? (passed ? now : null), bestScore: Math.max(prev?.bestScore ?? 0, score) }
  if (prev !== undefined && prev.passedAt === record.passedAt && prev.bestScore === record.bestScore) return { save, reward: NO_REWARD }
  const next: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, tests: { ...save.learning.tests, [testId]: record } } }
  if (!firstPass) return { save: next, reward: NO_REWARD }
  const coins = balance.coins.chapterTest
  return { save: addCoins(addXp(next, balance.xp.chapterTest, now), coins), reward: { xp: balance.xp.chapterTest, newWords: 0, ...(coins > 0 ? { coins } : {}) } }
}

/** その日の学習を終えたら、スタンプを押す（balance の stampActivities にある学習だけ。1日1つ） */
export function stampToday(save: SaveData, activity: StampActivity, balance: Balance, now: string): { save: SaveData; stamped: boolean } {
  const today = localDate(now)
  if (!balance.stampActivities.includes(activity) || save.daily.stamps.includes(today)) return { save, stamped: false }
  return { save: { ...save, updatedAt: now, daily: { ...save.daily, stamps: withStamp(save.daily.stamps, today) } }, stamped: true }
}

/** 読み物の問題に正解した記録を付ける（key は reading_001#0）。問題ごとに、初めて正解したときだけ経験値。復習には入れない（計画 Q12） */
export function recordReadingCorrect(save: SaveData, key: string, balance: Balance, now: string): Updated {
  if (save.learning.readings[key] !== undefined) return { save, reward: NO_REWARD }
  const next: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, readings: { ...save.learning.readings, [key]: { correctAt: now } } } }
  return { save: addXp(next, balance.xp.readingQuestion, now), reward: { xp: balance.xp.readingQuestion, newWords: 0 } }
}

/** 注文できた記録を付ける（注文した品物を足す）。初めて注文できたときだけ経験値（GAME_SPEC 4-4） */
export function recordOrder(save: SaveData, orderId: string, itemKey: string, balance: Balance, now: string): Updated {
  const prev = save.learning.orders[orderId]
  if (prev !== undefined && prev.items.includes(itemKey)) return { save, reward: NO_REWARD }
  const record = prev === undefined ? { firstAt: now, items: [itemKey] } : { ...prev, items: [...prev.items, itemKey] }
  const next: SaveData = { ...save, updatedAt: now, learning: { ...save.learning, orders: { ...save.learning.orders, [orderId]: record } } }
  if (prev !== undefined) return { save: next, reward: NO_REWARD }
  return { save: addXp(next, balance.xp.order, now), reward: { xp: balance.xp.order, newWords: 0 } }
}

/** おはなしを見た記録を付ける（アルバムに入る）。2回目以降は変えない */
export function seeStory(save: SaveData, storyId: string, now: string): SaveData {
  if (save.progress.storiesSeen[storyId] !== undefined) return save
  return { ...save, updatedAt: now, progress: { ...save.progress, storiesSeen: { ...save.progress.storiesSeen, [storyId]: { seenAt: now } } } }
}

/**
 * タップした単語を「見かけた単語」に入れ、翌日から復習に出す（GAME_SPEC 4-8）。経験値は付けない。
 * すでに図鑑で覚えた単語・見かけた単語なら何もしない
 */
export function rememberWord(save: SaveData, vocabId: string, chapter: number, balance: Balance, now: string): SaveData {
  if (save.learning.words[vocabId] !== undefined || save.learning.seen[vocabId] !== undefined) return save
  const key = reviewKey('word', vocabId)
  const review = save.learning.review[key] === undefined ? { ...save.learning.review, [key]: freshRecord(localDate(now), balance.review) } : save.learning.review
  return { ...save, updatedAt: now, learning: { ...save.learning, seen: { ...save.learning.seen, [vocabId]: { seenAt: now, chapter } }, review } }
}
