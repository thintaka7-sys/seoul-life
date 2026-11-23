// 章末テスト（GAME_SPEC 4-9）。問題は、その章の単語・文法・会話から作り、テストの items があれば混ぜる。
// テストは、その章の会話の問題の往復に、すべて一度は答えたら受けられる（計画 Q11）。

import type { Balance, ChapterTest, Conversation, GameEvent } from '../../data/types'
import { shuffle, type Random } from '../../learning/hangul/quiz'
import { isQuestionTurn } from '../../learning/practice/questions'
import { parseReviewKey, reviewKey } from '../../learning/review/review'
import { conversationTurnKey, type ConversationRecord } from '../../storage/saveData'

export interface TestSources {
  events: readonly GameEvent[]
  conversations: readonly Conversation[]
  /** 単語の、形が変わる言葉の問題のキー（省略したら出さない） */
  formKeysOf?: (vocabId: string) => string[]
}

/** その章の会話の、問題の往復（会話ID#往復の番号） */
export function chapterTurnIds(chapter: number, conversations: readonly Conversation[]): string[] {
  return conversations.filter((c) => c.chapter === chapter).flatMap((c) => c.turns.flatMap((t, i) => (isQuestionTurn(t) ? [conversationTurnKey(c.id, i)] : [])))
}

/** テストを受けられるか。answered / total は、答えた問題の往復の数と、その章の問題の往復の数 */
export function testProgress(test: ChapterTest, conversations: readonly Conversation[], records: Readonly<Record<string, ConversationRecord>>): { answered: number; total: number; unlocked: boolean } {
  const ids = chapterTurnIds(test.chapter, conversations)
  const answered = ids.filter((id) => records[id]?.choice === true || records[id]?.write === true).length
  return { answered, total: ids.length, unlocked: ids.length > 0 && answered === ids.length }
}

/** テストの問題のもと：その章のイベントで覚える単語・文法（形が変わる言葉の問題も）、その章の会話の問題の往復、テストの items */
export function chapterTestKeys(test: ChapterTest, sources: TestSources): string[] {
  const learn = sources.events.filter((e) => e.chapter === test.chapter).flatMap((e) => e.steps.flatMap((s) => (s.type === 'learn' ? [s] : [])))
  const keys = [
    ...learn.flatMap((s) => s.vocabulary.map((id) => reviewKey('word', id))),
    ...learn.flatMap((s) => s.grammar.map((id) => reviewKey('grammar', id))),
    ...(sources.formKeysOf === undefined ? [] : learn.flatMap((s) => s.vocabulary.flatMap(sources.formKeysOf ?? (() => [])))),
    ...chapterTurnIds(test.chapter, sources.conversations).map((id) => reviewKey('turn', id)),
    ...test.items.map((item) => reviewKey('drill', item.id)),
  ]
  return [...new Set(keys)]
}

/** count 問を選ぶ。種類（単語・文法・会話・追加の問題）がかたよらないよう、種類ごとに順に1問ずつ選ぶ */
export function pickTestKeys(keys: readonly string[], count: number, random: Random): string[] {
  const groups = new Map<string, string[]>()
  for (const key of shuffle(keys, random)) {
    const kind = parseReviewKey(key)?.kind ?? 'other'
    groups.set(kind, [...(groups.get(kind) ?? []), key])
  }
  const kinds = shuffle([...groups.keys()], random)
  const picked: string[] = []
  while (picked.length < count && kinds.some((k) => (groups.get(k)?.length ?? 0) > 0)) {
    for (const k of kinds) {
      if (picked.length >= count) break
      const key = groups.get(k)?.shift()
      if (key !== undefined) picked.push(key)
    }
  }
  return shuffle(picked, random)
}

/** テストの問題数と合格の基準（省略したら balance の値） */
export function testSettings(test: ChapterTest, balance: Balance): { count: number; passPercent: number } {
  return { count: test.questionCount ?? balance.testQuestions, passPercent: test.passPercent ?? balance.testPassPercent }
}
