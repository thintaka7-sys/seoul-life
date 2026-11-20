// 復習・練習の画面から使う、教材とセーブデータのつなぎ。

import { content } from '../data'
import { createPracticeIndex } from '../learning/practice/questions'
import { parseReviewKey, reviewKey } from '../learning/review/review'
import type { SaveData } from '../storage/saveData'

/** 教材から問題を作る索引（ドリルとテストの問題も含む） */
export const practiceIndex = createPracticeIndex({
  vocabulary: content.vocabulary,
  grammar: content.grammar,
  conversations: content.conversations,
  drillGroups: [...content.drills.map((d) => d.items), ...content.chapterTests.map((t) => t.items)],
})

/** 練習で選べるもの */
export type PracticeCategory = 'word' | 'grammar' | 'turn'

/** 学んだもの（覚えた単語・文法、正解した会話の往復）のうち、いまの教材で問題を作れるもののキー */
export function learnedKeys(save: SaveData, category: PracticeCategory): string[] {
  const { words, grammar, conversations } = save.learning
  const keys =
    category === 'word'
      ? Object.keys(words).map((id) => reviewKey('word', id))
      : category === 'grammar'
        ? Object.keys(grammar).map((id) => reviewKey('grammar', id))
        : Object.entries(conversations)
            .filter(([, r]) => r.choice || r.write)
            .map(([id]) => reviewKey('turn', id))
  return keys.filter(practiceIndex.exists)
}

/** フリガナの表示を決める章：単語・文法は覚えたときの章（会話は会話の章、ドリルは1章） */
export function chapterOfKey(save: SaveData): (key: string) => number | undefined {
  return (key) => {
    const parsed = parseReviewKey(key)
    if (parsed?.kind === 'word') return save.learning.words[parsed.id]?.chapter
    if (parsed?.kind === 'grammar') return save.learning.grammar[parsed.id]?.chapter
    return undefined
  }
}
