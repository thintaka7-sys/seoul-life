// 聞き分け練習（GAME_SPEC 4-10）の1回分の問題。
// - 1つの組の練習：その組の音を、ほぼ同じ回数ずつ読み上げる（かたよると、当てずっぽうでも正解しやすくなるため）
// - まぜた練習：組をほぼ同じ回数ずつ出し、組の中の音もかたよらないようにする
// 選択肢は、いつも同じ組の音だけ（earQuestion）。乱数は引数で受け取る（テストで同じ問題を作れるように）。

import type { EarItem, EarSet } from '../../data/types'
import { shuffle, type Random } from '../hangul/quiz'
import { earQuestion, type PracticeQuestion } from '../practice/questions'

/**
 * items から count 個を、それぞれほぼ同じ回数（差は1回まで）になるように並べる。
 * items を並べ替えたものをつなげ、つなぎ目で同じものが続かないようにする
 */
export function balancedPicks<T>(items: readonly T[], count: number, random: Random): T[] {
  const result: T[] = []
  while (result.length < count && items.length > 0) {
    const block = shuffle(items, random)
    const first = block[0]
    if (block.length > 1 && first !== undefined && first === result.at(-1)) {
      block[0] = block[1] as T
      block[1] = first
    }
    result.push(...block)
  }
  return result.slice(0, count)
}

/** 聞き分けの1回分。sets が1つならその組だけ、複数ならまぜて出す */
export function earRound(sets: readonly EarSet[], count: number, random: Random): PracticeQuestion[] {
  const usable = sets.filter((s) => s.items.length >= 2)
  if (usable.length === 0) return []
  // どの問題でどの組を出すか（組ごとの回数をそろえ、順番はまぜる）
  const slots = shuffle(balancedPicks(usable, count, random), random)
  const targets = new Map<string, EarItem[]>()
  for (const set of usable) {
    const times = slots.filter((s) => s.id === set.id).length
    targets.set(set.id, balancedPicks(set.items, times, random))
  }
  return slots.flatMap((set) => {
    const target = targets.get(set.id)?.shift()
    return target === undefined ? [] : [earQuestion(set, target, { random })]
  })
}
